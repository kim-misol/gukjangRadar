/**
 * T2.3.3(경로 조립 마무리)+2.3.4(LLM 심사)+2.3.5(반증검사)+2.3.6(가드레일)+2.3.7(스코어링)+
 * 2.3.8(저장) — `connection.build` 큐가 클러스터 하나에 대해 돌리는 파이프라인 본체.
 * docs/11 §2 ⑧⑨⑩⑪⑫⑬.
 *
 * 흐름: 클러스터의 개체마다 → Recall(findCandidatesForEntity) → 후보가 있으면 LLM 심사
 * (company_matching.md) → 가드레일 G1~G9 → business_relevance≥60이면 반증검사(counter-check.ts,
 * config.counterCheck가 있을 때만) → 스코어링(§10) → connection upsert.
 * 시세(⑪)는 W7 KIS 배치 의존이라 이번 주는 marketReaction이 항상 null이다(§3 재정규화 경로 그대로).
 */
import {
  applyGuardrails,
  computeConfidenceScore,
  computeConnectionScore,
  computeCostUsd,
  computeInputHash,
  computeMemeScore,
  computeRelevanceBand,
  computeSupplyChainScore,
  decideConnectionStatus,
  isDangerousEventHeadline,
  isNegativePersonEventHeadline,
  renderPromptTemplate,
  toLlmJudgement,
  CompanyMatchingOutputSchema,
  type GuardrailContext,
  type KeywordMatchConfig,
  type MemeConfig,
  type RecallConfig,
  type ReviewTriggersConfig,
  type ScoringConfig,
} from '@gukjang/core';
import type { Candidate, ConnectionKind } from '@gukjang/spec';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { and, eq, inArray } from 'drizzle-orm';
import type { AnthropicLlmClient } from '../llm/anthropic-client';
import { LlmValidationError } from '../llm/anthropic-client';
import { loadPrompt } from '../llm/load-prompt';
import { findCachedOutput, isUnderDailyCap, recordLlmRun } from '../llm/llm-run-store';
import { getModelRates } from '../llm/model-pricing';
import { COMPANY_MATCHING_TOOL } from '../llm/tool-schemas';
import { findCandidatesForEntity } from './search-candidates';
import {
  COUNTER_CHECK_BR_THRESHOLD,
  runCounterCheck,
  type CounterCheckDeps,
} from './counter-check';

export interface BuildConnectionsConfig {
  matchModel: string;
  dailyCostCapUsd: number;
  recall: RecallConfig;
  keywordMatch: KeywordMatchConfig;
  meme: MemeConfig;
  scoring: ScoringConfig;
  reviewTriggers: ReviewTriggersConfig;
  /** T2.3.5 반증검사 — 없으면(DART_API_KEY 미설정 등) 이 단계를 건너뛴다. */
  counterCheck?: Pick<CounterCheckDeps, 'dartClient' | 'model'>;
}

export interface BuildConnectionsResult {
  entitiesProcessed: number;
  candidatesJudged: number;
  connectionsSaved: number;
  guardrailViolations: number;
}

function pathLabelsDisplay(candidate: Candidate): string {
  return candidate.path.map((s) => s.label).join(' → ');
}

async function fetchCompanyDetails(db: ReturnType<typeof getDb>, companyIds: readonly number[]) {
  if (companyIds.length === 0)
    return new Map<
      number,
      { sector: string | null; businessSummary: string | null; corpCode: string | null }
    >();
  const rows = await db
    .select({
      id: schema.company.id,
      sector: schema.company.sector,
      businessSummary: schema.company.businessSummary,
      corpCode: schema.company.corpCode,
    })
    .from(schema.company)
    .where(inArray(schema.company.id, [...companyIds]));
  return new Map(
    rows.map((r) => [
      r.id,
      { sector: r.sector, businessSummary: r.businessSummary, corpCode: r.corpCode },
    ]),
  );
}

async function fetchAllKnownCompanyTerms(db: ReturnType<typeof getDb>) {
  const rows = await db
    .select({ name: schema.company.name, ticker: schema.company.ticker })
    .from(schema.company);
  return rows;
}

export async function buildConnectionsForCluster(
  db: ReturnType<typeof getDb>,
  llmClient: Pick<AnthropicLlmClient, 'callTool'>,
  clusterId: number,
  config: BuildConnectionsConfig,
  now: Date = new Date(),
): Promise<BuildConnectionsResult> {
  const [cluster] = await db
    .select()
    .from(schema.newsCluster)
    .where(eq(schema.newsCluster.id, clusterId));
  if (!cluster) throw new Error(`클러스터 없음: #${clusterId}`);
  if (!cluster.aiSummary) {
    throw new Error(
      `요약이 없는 클러스터는 연결을 만들 수 없음 — 먼저 summarizeCluster: #${clusterId}`,
    );
  }

  const entityRows = await db
    .select({
      entityId: schema.entity.id,
      name: schema.entity.name,
      kind: schema.entity.kind,
      subtype: schema.entity.subtype,
      nodeId: schema.graphNode.id,
    })
    .from(schema.newsEntity)
    .innerJoin(schema.entity, eq(schema.newsEntity.entityId, schema.entity.id))
    .innerJoin(
      schema.graphNode,
      and(eq(schema.graphNode.kind, 'ENTITY'), eq(schema.graphNode.refId, schema.entity.id)),
    )
    .where(eq(schema.newsEntity.clusterId, clusterId));

  const prompt = loadPrompt('company_matching.md');
  const isDangerousEvent = isDangerousEventHeadline(cluster.headline);
  const isNegativePersonEvent = isNegativePersonEventHeadline(cluster.headline);
  const knownCompanies = await fetchAllKnownCompanyTerms(db);

  let candidatesJudged = 0;
  let connectionsSaved = 0;
  let guardrailViolationCount = 0;

  for (const entityRow of entityRows) {
    const candidates = await findCandidatesForEntity(
      db,
      {
        id: entityRow.entityId,
        name: entityRow.name,
        kind: entityRow.kind,
        nodeId: entityRow.nodeId,
      },
      config.recall,
      config.keywordMatch,
    );
    if (candidates.length === 0) continue;

    const companyDetails = await fetchCompanyDetails(
      db,
      candidates.map((c) => c.companyId),
    );
    const candidateByCompanyId = new Map(candidates.map((c) => [c.companyId, c]));

    const userContent = renderPromptTemplate(
      prompt.userTemplate,
      {
        headline: cluster.headline,
        summary: cluster.aiSummary,
        entity_name: entityRow.name,
        entity_kind: entityRow.kind,
        entity_subtype: entityRow.subtype ?? '',
      },
      {
        candidates: candidates.map((c) => ({
          id: String(c.companyId),
          name: c.name,
          ticker: c.ticker,
          sector: companyDetails.get(c.companyId)?.sector ?? '',
          business_summary: companyDetails.get(c.companyId)?.businessSummary ?? '',
          path_labels: pathLabelsDisplay(c),
          recall_rule: c.recallRule,
        })),
      },
    );

    // docs/08 §7과 같은 형태: 입력을 결정하는 모든 것(헤드라인/요약/앵커개체/후보집합)을 해시한다.
    const inputHash = computeInputHash([
      cluster.headline,
      cluster.aiSummary,
      entityRow.name,
      candidates
        .map((c) => c.companyId)
        .sort((a, b) => a - b)
        .join(','),
      prompt.promptVersion,
    ]);

    let rawJudgements: ReturnType<typeof toLlmJudgement>[] | null = null;
    let llmRunId: number | null = null;

    const cached = await findCachedOutput(db, {
      stage: 'MATCH',
      promptVersion: prompt.promptVersion,
      inputHash,
    });
    if (cached) {
      const parsed = CompanyMatchingOutputSchema.safeParse(cached);
      if (parsed.success) rawJudgements = parsed.data.judgements.map(toLlmJudgement);
    }

    if (rawJudgements === null) {
      if (!(await isUnderDailyCap(db, config.dailyCostCapUsd, now))) continue;

      const rates = getModelRates(config.matchModel);
      try {
        const result = await llmClient.callTool({
          model: config.matchModel,
          system: prompt.system,
          userContent,
          tool: COMPANY_MATCHING_TOOL,
          maxTokens: 4096,
          parseOutput: (raw) => {
            const parsed = CompanyMatchingOutputSchema.safeParse(raw);
            return parsed.success
              ? { success: true as const, data: parsed.data }
              : { success: false as const, error: parsed.error.message };
          },
        });
        rawJudgements = result.output.judgements.map(toLlmJudgement);
        llmRunId = await recordLlmRun(db, {
          stage: 'MATCH',
          promptVersion: prompt.promptVersion,
          model: config.matchModel,
          inputHash,
          inputRef: {
            clusterId,
            entityId: entityRow.entityId,
            candidateIds: candidates.map((c) => c.companyId),
          },
          output: result.output,
          usage: result.usage,
          costUsd: computeCostUsd(result.usage, rates),
          latencyMs: result.latencyMs,
          status: 'OK',
        });
      } catch (err) {
        const isValidationError = err instanceof LlmValidationError;
        const usage = isValidationError ? err.usage : { inputTokens: 0, outputTokens: 0 };
        await recordLlmRun(db, {
          stage: 'MATCH',
          promptVersion: prompt.promptVersion,
          model: config.matchModel,
          inputHash,
          inputRef: { clusterId, entityId: entityRow.entityId },
          usage,
          costUsd: computeCostUsd(usage, rates),
          status: isValidationError ? 'INVALID_JSON' : 'ERROR',
          error: String(err),
        });
        continue;
      }
    }

    candidatesJudged += rawJudgements.length;

    // G2: 이번 후보집합 밖의 알려진 기업명/티커는 explanation에 등장하면 안 된다.
    const candidateNameSet = new Set(candidates.map((c) => c.name));
    const candidateTickerSet = new Set(candidates.map((c) => c.ticker));
    const forbiddenMentionTerms = knownCompanies
      .filter((k) => !candidateNameSet.has(k.name) && !candidateTickerSet.has(k.ticker))
      .flatMap((k) => [k.name, k.ticker]);

    for (const judgement of rawJudgements) {
      const candidate = candidateByCompanyId.get(judgement.companyId);
      const ctx: GuardrailContext = {
        candidateCompanyIds: candidates.map((c) => c.companyId),
        forbiddenMentionTerms,
        businessSummary: candidate
          ? (companyDetails.get(candidate.companyId)?.businessSummary ?? null)
          : null,
        pathLabels: candidate ? candidate.path.map((s) => s.label) : [],
        isDangerousEvent,
        isNegativePersonEvent,
        pathNodeIds: candidate ? candidate.path.map((s) => s.nodeId) : [],
        hopCount: candidate?.hopCount ?? 0,
      };

      const guardrailResult = applyGuardrails(judgement, ctx);
      if (guardrailResult.violations.length > 0) {
        guardrailViolationCount += guardrailResult.violations.length;
        await db.insert(schema.guardrailViolation).values(
          guardrailResult.violations.map((v) => ({
            llmRunId,
            clusterId,
            ruleId: v.ruleId,
            detail: v.detail,
          })),
        );
      }
      if (!guardrailResult.passed || !candidate) continue;
      if (guardrailResult.judgement.verdict !== 'ACCEPT') continue;

      const j = guardrailResult.judgement;

      // T2.3.5 — 반증검사(docs/09 §6): BR≥60 주장만, config.counterCheck가 있을 때만 돌린다.
      let businessRelevance = j.businessRelevance;
      let counterEvidence: string | null = null;
      if (config.counterCheck && businessRelevance >= COUNTER_CHECK_BR_THRESHOLD) {
        const companyDetail = companyDetails.get(candidate.companyId);
        const counterResult = await runCounterCheck(
          {
            db,
            llmClient,
            dartClient: config.counterCheck.dartClient,
            model: config.counterCheck.model,
            dailyCostCapUsd: config.dailyCostCapUsd,
            now,
          },
          {
            clusterId,
            claim: j.explanation,
            companyId: candidate.companyId,
            companyName: candidate.name,
            ticker: candidate.ticker,
            corpCode: companyDetail?.corpCode ?? null,
            businessSummary: companyDetail?.businessSummary ?? null,
          },
          businessRelevance,
        );
        if (counterResult.refuted) {
          businessRelevance = counterResult.adjustedRelevance;
          counterEvidence = counterResult.reason;
        }
      }

      const supplyChainScore = computeSupplyChainScore(candidate.path, candidate.pathEdgeWeights);
      const confidenceScore = computeConfidenceScore(candidate.pathEdgeConfidences, j.confidence);
      const memeScore = computeMemeScore(
        {
          memeLlm: j.meme,
          businessRelevance,
          marketReaction: null,
          connectionType: j.connectionType,
        },
        config.meme,
      );
      const rawScores = {
        businessRelevance,
        keywordMatch: candidate.keywordMatchScore,
        supplyChain: supplyChainScore,
        marketReaction: null,
        meme: memeScore,
        confidence: confidenceScore,
      };
      const connectionScore = computeConnectionScore(
        rawScores,
        j.connectionType,
        candidate.hopCount,
        {
          hasEvidenceGap: candidate.pathEdgeConfidences.some((c) => c <= 0.3),
          ambiguousAlias: candidate.isAmbiguousAlias,
          reviewed: false,
        },
        config.scoring,
      );
      const relevanceBand = computeRelevanceBand(businessRelevance, config.scoring.relevanceBand);
      const status = decideConnectionStatus(
        {
          businessRelevance,
          connectionScore,
          memeScore,
          hopCount: candidate.hopCount,
          isAmbiguousAlias: candidate.isAmbiguousAlias,
          forcedPending: guardrailResult.forcedPending,
        },
        config.reviewTriggers,
      );

      const values = {
        clusterId,
        companyId: candidate.companyId,
        anchorEntityId: entityRow.entityId,
        connectionType: j.connectionType as ConnectionKind,
        tradeDate: cluster.tradeDate,
        path: candidate.path,
        hopCount: candidate.hopCount,
        businessRelevanceScore: businessRelevance,
        counterEvidence,
        keywordMatchScore: candidate.keywordMatchScore,
        supplyChainScore,
        marketReactionScore: 0,
        memeScore,
        confidenceScore,
        connectionScore,
        relevanceBand,
        explanation: j.explanation,
        caution: j.caution,
        dataSources: candidate.evidence,
        status,
        scoringVersion: config.scoring.version,
        promptVersion: prompt.promptVersion,
        llmRunId,
      };

      await db
        .insert(schema.connection)
        .values(values)
        .onConflictDoUpdate({
          target: [
            schema.connection.clusterId,
            schema.connection.companyId,
            schema.connection.connectionType,
          ],
          set: { ...values, updatedAt: new Date() },
        });
      connectionsSaved++;
    }
  }

  return {
    entitiesProcessed: entityRows.length,
    candidatesJudged,
    connectionsSaved,
    guardrailViolations: guardrailViolationCount,
  };
}
