/**
 * T2.2.3(추출 + input_hash 캐시) + T2.2.4(정규화·병합·불용어 + graph_node/MENTIONS).
 * docs/11 §2-⑥⑦, docs/08-prompt-entity-extraction.md.
 *
 * canonical_id 기반 동의어 병합(§6-④, 예: "엔비디아" ← "NVIDIA")은 LLM이 매 추출마다 주는
 * `aliases` 필드로 그때그때 판정한다 — 상세 설계는 entity/merge-synonyms.ts 주석 참조.
 *
 * 실행: pnpm --filter @gukjang/worker exec tsx src/analysis/extract-entities.ts <clusterId>
 */
import {
  EntityExtractionOutputSchema,
  computeCostUsd,
  computeInputHash,
  isStoplisted,
  normalizeEntityName,
  renderPromptTemplate,
  toJamo,
  type ExtractedEntity,
} from '@gukjang/core';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { AnthropicLlmClient } from '../llm/anthropic-client';
import { LlmValidationError } from '../llm/anthropic-client';
import { loadPrompt } from '../llm/load-prompt';
import { findCachedOutput, isUnderDailyCap, recordLlmRun } from '../llm/llm-run-store';
import { getModelRates } from '../llm/model-pricing';
import { ENTITY_EXTRACTION_TOOL } from '../llm/tool-schemas';
import { ensureGraphNode } from '../graph/ensure-node';
import { mergeSynonymAliases } from '../entity/merge-synonyms';

const OTHER_TITLES_LIMIT = 5;

export type ExtractEntitiesStatus = 'OK' | 'CACHED' | 'SKIPPED_COST_CAP' | 'FAILED';

export interface ExtractEntitiesResult {
  status: ExtractEntitiesStatus;
  entitiesStored: number;
  entitiesStoplisted: number;
}

export interface ExtractEntitiesConfig {
  model: string;
  dailyCostCapUsd: number;
}

export async function extractEntitiesForCluster(
  db: ReturnType<typeof getDb>,
  llmClient: Pick<AnthropicLlmClient, 'callTool'>,
  clusterId: number,
  config: ExtractEntitiesConfig,
  now: Date = new Date(),
): Promise<ExtractEntitiesResult> {
  const [cluster] = await db
    .select()
    .from(schema.newsCluster)
    .where(eq(schema.newsCluster.id, clusterId));
  if (!cluster) throw new Error(`클러스터 없음: #${clusterId}`);
  if (!cluster.aiSummary) {
    throw new Error(
      `요약이 없는 클러스터는 개체를 추출할 수 없음 — 먼저 summarizeCluster: #${clusterId}`,
    );
  }
  if (!cluster.representativeArticleId) {
    throw new Error(`대표 기사가 없는 클러스터: #${clusterId}`);
  }

  const [repArticle] = await db
    .select({ title: schema.newsArticle.title, publishedAt: schema.newsArticle.publishedAt })
    .from(schema.newsArticle)
    .where(eq(schema.newsArticle.id, cluster.representativeArticleId));
  if (!repArticle) throw new Error(`대표 기사 조회 실패: #${cluster.representativeArticleId}`);

  const otherTitleRows = await db
    .select({ title: schema.newsArticle.title })
    .from(schema.clusterArticle)
    .innerJoin(schema.newsArticle, eq(schema.clusterArticle.articleId, schema.newsArticle.id))
    .where(
      and(
        eq(schema.clusterArticle.clusterId, clusterId),
        ne(schema.newsArticle.id, cluster.representativeArticleId),
      ),
    )
    .limit(OTHER_TITLES_LIMIT);

  const prompt = loadPrompt('entity_extraction.md');
  const userContent = renderPromptTemplate(prompt.userTemplate, {
    headline: repArticle.title,
    summary: cluster.aiSummary,
    source_titles: otherTitleRows.map((r) => r.title).join('\n'),
    published_at: repArticle.publishedAt.toISOString(),
  });
  // docs/08 §7 그대로: input_hash = sha256(headline + summary + prompt_version).
  const inputHash = computeInputHash([repArticle.title, cluster.aiSummary, prompt.promptVersion]);

  let entities: ExtractedEntity[] | null = null;
  let cacheHit = false;

  const cached = await findCachedOutput(db, {
    stage: 'ENTITY',
    promptVersion: prompt.promptVersion,
    inputHash,
  });
  if (cached) {
    const parsed = EntityExtractionOutputSchema.safeParse(cached);
    if (parsed.success) {
      entities = parsed.data.entities;
      cacheHit = true;
    }
  }

  if (entities === null) {
    if (!(await isUnderDailyCap(db, config.dailyCostCapUsd, now))) {
      await recordLlmRun(db, {
        stage: 'ENTITY',
        promptVersion: prompt.promptVersion,
        model: config.model,
        inputHash,
        inputRef: { clusterId },
        status: 'SKIPPED_COST_CAP',
      });
      await db
        .update(schema.newsCluster)
        .set({
          analysisStatus: 'SKIPPED',
          analysisError: '일일 LLM 비용 상한 초과 (개체추출 스킵)',
        })
        .where(eq(schema.newsCluster.id, clusterId));
      return { status: 'SKIPPED_COST_CAP', entitiesStored: 0, entitiesStoplisted: 0 };
    }

    const rates = getModelRates(config.model);
    try {
      const result = await llmClient.callTool({
        model: config.model,
        system: prompt.system,
        userContent,
        tool: ENTITY_EXTRACTION_TOOL,
        maxTokens: 4096,
        parseOutput: (raw) => {
          const parsed = EntityExtractionOutputSchema.safeParse(raw);
          return parsed.success
            ? { success: true as const, data: parsed.data }
            : { success: false as const, error: parsed.error.message };
        },
      });
      entities = result.output.entities;
      await recordLlmRun(db, {
        stage: 'ENTITY',
        promptVersion: prompt.promptVersion,
        model: config.model,
        inputHash,
        inputRef: { clusterId },
        output: result.output,
        usage: result.usage,
        costUsd: computeCostUsd(result.usage, rates),
        latencyMs: result.latencyMs,
        status: 'OK',
      });
    } catch (err) {
      // summarizeCluster와 동일한 이유로 검증 실패(INVALID_JSON)와 그 외 예외(ERROR)를 구분한다.
      const isValidationError = err instanceof LlmValidationError;
      const usage = isValidationError ? err.usage : { inputTokens: 0, outputTokens: 0 };
      await recordLlmRun(db, {
        stage: 'ENTITY',
        promptVersion: prompt.promptVersion,
        model: config.model,
        inputHash,
        inputRef: { clusterId },
        usage,
        costUsd: computeCostUsd(usage, rates),
        status: isValidationError ? 'INVALID_JSON' : 'ERROR',
        error: String(err),
      });
      await db
        .update(schema.newsCluster)
        .set({ analysisStatus: 'FAILED', analysisError: String(err) })
        .where(eq(schema.newsCluster.id, clusterId));
      return { status: 'FAILED', entitiesStored: 0, entitiesStoplisted: 0 };
    }
  }

  const stoplistRows = await db
    .select({ nameNorm: schema.entityStoplist.nameNorm })
    .from(schema.entityStoplist);
  const stoplistSet = new Set(stoplistRows.map((r) => r.nameNorm));

  const newsNodeId = await ensureGraphNode(db, 'NEWS', clusterId, cluster.headline);

  let entitiesStored = 0;
  let entitiesStoplisted = 0;

  for (const e of entities) {
    const nameNorm = normalizeEntityName(e.normalized);
    if (isStoplisted(nameNorm, stoplistSet)) {
      entitiesStoplisted++;
      continue;
    }

    const [entityRow] = await db
      .insert(schema.entity)
      .values({
        name: e.surface,
        nameNorm,
        nameJamo: toJamo(nameNorm),
        kind: e.kind,
        subtype: e.subtype,
        mentionTotal: 1,
      })
      .onConflictDoUpdate({
        target: [schema.entity.nameNorm, schema.entity.kind],
        // subtype은 이번 추출이 값을 준 경우에만 덮어쓴다 — 없으면(undefined) 기존 값을
        // null로 되돌리지 않고 그대로 둔다. 이전엔 mentionTotal만 갱신하고 subtype은 최초
        // insert 값에 영구히 고정돼 있었다(docs/19-remaining-work.md §4 2026-08-21 발견 버그).
        set: {
          mentionTotal: sql`${schema.entity.mentionTotal} + 1`,
          ...(e.subtype ? { subtype: e.subtype } : {}),
        },
      })
      .returning({ id: schema.entity.id });
    if (!entityRow) throw new Error(`entity upsert 실패: ${e.surface}`);

    if (e.aliases && e.aliases.length > 0) {
      await mergeSynonymAliases(db, entityRow.id, nameNorm, e.kind, e.aliases);
    }

    const entityNodeId = await ensureGraphNode(db, 'ENTITY', entityRow.id, e.surface);

    const evidence = {
      source: 'LLM',
      prompt_version: prompt.promptVersion,
      role: e.role,
      in_headline: e.in_headline,
    };
    await db
      .insert(schema.graphEdge)
      .values({
        srcNodeId: newsNodeId,
        dstNodeId: entityNodeId,
        edgeType: 'MENTIONS',
        weight: e.importance.toString(),
        confidence: '0.8',
        origin: 'LLM',
        evidence,
      })
      .onConflictDoUpdate({
        target: [schema.graphEdge.srcNodeId, schema.graphEdge.dstNodeId, schema.graphEdge.edgeType],
        set: { weight: e.importance.toString(), evidence },
      });

    await db
      .insert(schema.newsEntity)
      .values({
        clusterId,
        entityId: entityRow.id,
        importance: e.importance.toString(),
        inHeadline: e.in_headline,
        role: e.role,
        mentionCount: 1,
      })
      .onConflictDoUpdate({
        target: [schema.newsEntity.clusterId, schema.newsEntity.entityId],
        set: {
          importance: e.importance.toString(),
          inHeadline: e.in_headline,
          role: e.role,
          mentionCount: sql`${schema.newsEntity.mentionCount} + 1`,
        },
      });

    entitiesStored++;
  }

  await db
    .update(schema.newsCluster)
    .set({ analysisStatus: 'DONE' })
    .where(eq(schema.newsCluster.id, clusterId));

  return { status: cacheHit ? 'CACHED' : 'OK', entitiesStored, entitiesStoplisted };
}

async function main(): Promise<void> {
  const clusterId = Number(process.argv[2]);
  if (!clusterId) {
    console.error('사용법: tsx src/analysis/extract-entities.ts <clusterId>');
    process.exit(1);
  }
  const { loadEnv } = await import('@gukjang/core');
  const { getDb: getDbFn, closeDb } = await import('@gukjang/db');
  const { AnthropicLlmClient } = await import('../llm/anthropic-client');
  const env = loadEnv();
  const db = getDbFn();
  const client = new AnthropicLlmClient({ apiKey: env.ANTHROPIC_API_KEY });
  const result = await extractEntitiesForCluster(db, client, clusterId, {
    model: env.LLM_MODEL,
    dailyCostCapUsd: env.LLM_DAILY_COST_CAP_USD,
  });
  console.log('✓ 완료 —', result);
  await closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('✗ 개체 추출 실패:', err);
    process.exit(1);
  });
}
