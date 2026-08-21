/**
 * T2.2.2 — 클러스터 대표 기사 + 리드 + 다른 매체 제목 최대 5개로 3문장 요약을 만든다.
 * docs/11 §2-⑤. 저장 전에 quote-guard(20자 초과 인용 금지)를 반드시 통과해야 한다.
 *
 * 실행: pnpm --filter @gukjang/worker exec tsx src/analysis/summarize-cluster.ts <clusterId>
 */
import {
  SummaryOutputSchema,
  computeCostUsd,
  computeInputHash,
  findLongVerbatimQuotes,
  renderPromptTemplate,
} from '@gukjang/core';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { and, eq, ne } from 'drizzle-orm';
import type { AnthropicLlmClient } from '../llm/anthropic-client';
import { LlmValidationError } from '../llm/anthropic-client';
import { loadPrompt } from '../llm/load-prompt';
import { findCachedOutput, isUnderDailyCap, recordLlmRun } from '../llm/llm-run-store';
import { getModelRates } from '../llm/model-pricing';
import { SUMMARY_TOOL } from '../llm/tool-schemas';

const OTHER_TITLES_LIMIT = 5;

export type SummarizeClusterStatus =
  'OK' | 'CACHED' | 'SKIPPED_COST_CAP' | 'GUARDRAIL_BLOCKED' | 'FAILED';

export interface SummarizeClusterResult {
  status: SummarizeClusterStatus;
  summary?: string;
}

export interface SummarizeClusterConfig {
  model: string;
  dailyCostCapUsd: number;
}

export async function summarizeCluster(
  db: ReturnType<typeof getDb>,
  llmClient: Pick<AnthropicLlmClient, 'callTool'>,
  clusterId: number,
  config: SummarizeClusterConfig,
  now: Date = new Date(),
): Promise<SummarizeClusterResult> {
  const [cluster] = await db
    .select()
    .from(schema.newsCluster)
    .where(eq(schema.newsCluster.id, clusterId));
  if (!cluster) throw new Error(`클러스터 없음: #${clusterId}`);
  if (!cluster.representativeArticleId) {
    throw new Error(`대표 기사가 없는 클러스터: #${clusterId}`);
  }

  const [repArticle] = await db
    .select({ title: schema.newsArticle.title, lead: schema.newsArticle.lead })
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
  const otherTitles = otherTitleRows.map((r) => r.title);

  const prompt = loadPrompt('summary.md');
  const lead = repArticle.lead ?? '';
  const sourceTitlesText = otherTitles.join('\n');
  const userContent = renderPromptTemplate(prompt.userTemplate, {
    headline: repArticle.title,
    lead,
    source_titles: sourceTitlesText,
  });
  const inputHash = computeInputHash([
    repArticle.title,
    lead,
    sourceTitlesText,
    prompt.promptVersion,
  ]);

  const cached = await findCachedOutput(db, {
    stage: 'SUMMARY',
    promptVersion: prompt.promptVersion,
    inputHash,
  });
  if (cached) {
    const parsed = SummaryOutputSchema.safeParse(cached);
    if (parsed.success) {
      const summary = parsed.data.sentences.join(' ');
      await db
        .update(schema.newsCluster)
        .set({ aiSummary: summary })
        .where(eq(schema.newsCluster.id, clusterId));
      return { status: 'CACHED', summary };
    }
  }

  if (!(await isUnderDailyCap(db, config.dailyCostCapUsd, now))) {
    await db
      .update(schema.newsCluster)
      .set({ analysisStatus: 'SKIPPED', analysisError: '일일 LLM 비용 상한 초과 (요약 스킵)' })
      .where(eq(schema.newsCluster.id, clusterId));
    return { status: 'SKIPPED_COST_CAP' };
  }

  const rates = getModelRates(config.model);

  try {
    const result = await llmClient.callTool({
      model: config.model,
      system: prompt.system,
      userContent,
      tool: SUMMARY_TOOL,
      maxTokens: 1024,
      parseOutput: (raw) => {
        const parsed = SummaryOutputSchema.safeParse(raw);
        return parsed.success
          ? { success: true as const, data: parsed.data }
          : { success: false as const, error: parsed.error.message };
      },
    });

    const summary = result.output.sentences.join(' ');
    const sourceTexts = [repArticle.title, lead, ...otherTitles];
    const violations = findLongVerbatimQuotes(summary, sourceTexts);
    const costUsd = computeCostUsd(result.usage, rates);

    if (violations.length > 0) {
      await recordLlmRun(db, {
        stage: 'SUMMARY',
        promptVersion: prompt.promptVersion,
        model: config.model,
        inputHash,
        inputRef: { clusterId },
        output: result.output,
        usage: result.usage,
        costUsd,
        latencyMs: result.latencyMs,
        status: 'GUARDRAIL_BLOCKED',
        error: `20자 초과 원문 인용: ${violations.join(' / ')}`,
      });
      await db
        .update(schema.newsCluster)
        .set({ analysisStatus: 'FAILED', analysisError: '요약이 원문을 20자 넘게 그대로 인용함' })
        .where(eq(schema.newsCluster.id, clusterId));
      return { status: 'GUARDRAIL_BLOCKED' };
    }

    await recordLlmRun(db, {
      stage: 'SUMMARY',
      promptVersion: prompt.promptVersion,
      model: config.model,
      inputHash,
      inputRef: { clusterId },
      output: result.output,
      usage: result.usage,
      costUsd,
      latencyMs: result.latencyMs,
      status: 'OK',
    });
    await db
      .update(schema.newsCluster)
      .set({ aiSummary: summary })
      .where(eq(schema.newsCluster.id, clusterId));
    return { status: 'OK', summary };
  } catch (err) {
    // LlmValidationError = 재시도까지 소진한 진짜 스키마 검증 실패. 그 외(인증/네트워크/레이트리밋
    // 등 SDK 예외)는 JSON과 무관하므로 status를 섞지 않는다 — llm_run.status 주석 그대로.
    const isValidationError = err instanceof LlmValidationError;
    const usage = isValidationError ? err.usage : { inputTokens: 0, outputTokens: 0 };
    await recordLlmRun(db, {
      stage: 'SUMMARY',
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
    return { status: 'FAILED' };
  }
}

async function main(): Promise<void> {
  const clusterId = Number(process.argv[2]);
  if (!clusterId) {
    console.error('사용법: tsx src/analysis/summarize-cluster.ts <clusterId>');
    process.exit(1);
  }
  const { loadEnv } = await import('@gukjang/core');
  const { getDb: getDbFn, closeDb } = await import('@gukjang/db');
  const { AnthropicLlmClient } = await import('../llm/anthropic-client');
  const env = loadEnv();
  const db = getDbFn();
  const client = new AnthropicLlmClient({ apiKey: env.ANTHROPIC_API_KEY });
  const result = await summarizeCluster(db, client, clusterId, {
    model: env.LLM_MODEL,
    dailyCostCapUsd: env.LLM_DAILY_COST_CAP_USD,
  });
  console.log('✓ 완료 —', result);
  await closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('✗ 요약 실패:', err);
    process.exit(1);
  });
}
