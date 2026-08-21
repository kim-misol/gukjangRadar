/**
 * T2.3.5 — 반증 검사(B6, docs/09 §6, docs/13 §3). `business_relevance ≥ 60`인 연결에
 * 한해, 그 주장을 반박해 보라고 다시 LLM에 묻는다("낙관 편향 제거"). 입력은 주장 문장 +
 * business_summary + 최근 공시 제목(최대 10개, DART list.json). DART/LLM 어느 쪽이
 * 실패해도 원래 판정을 그대로 둔다(fail open) — 이 기능이 없던 이전 동작보다 나빠지지
 * 않게 한다.
 */
import {
  computeCostUsd,
  computeInputHash,
  extractDisclosureTitles,
  renderPromptTemplate,
  CounterCheckOutputSchema,
} from '@gukjang/core';
import type { getDb } from '@gukjang/db';
import type { DartClient } from '../collectors/dart-client';
import type { AnthropicLlmClient } from '../llm/anthropic-client';
import { LlmValidationError } from '../llm/anthropic-client';
import { loadPrompt } from '../llm/load-prompt';
import { findCachedOutput, isUnderDailyCap, recordLlmRun } from '../llm/llm-run-store';
import { getModelRates } from '../llm/model-pricing';
import { COUNTER_CHECK_TOOL } from '../llm/tool-schemas';

/** docs/09 §6 / docs/13 §2(G6) — 이 값 이상인 주장만 반증 검사 대상. */
export const COUNTER_CHECK_BR_THRESHOLD = 60;

const DISCLOSURE_LOOKBACK_DAYS = 180;
const NO_DISCLOSURE_PLACEHOLDER = '(최근 6개월 내 공시 없음)';

export interface CounterCheckDeps {
  db: ReturnType<typeof getDb>;
  llmClient: Pick<AnthropicLlmClient, 'callTool'>;
  dartClient: Pick<DartClient, 'fetchDisclosureList'>;
  model: string;
  dailyCostCapUsd: number;
  now: Date;
}

export interface CounterCheckInput {
  clusterId: number;
  claim: string;
  companyId: number;
  companyName: string;
  ticker: string;
  corpCode: string | null;
  businessSummary: string | null;
}

export interface CounterCheckResult {
  refuted: boolean;
  /** refuted일 때만 채워진다 — 사용자에게 노출되는 반증 사유(docs/13 §3). */
  reason: string | null;
  adjustedRelevance: number;
}

function toYyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function fetchDisclosureTitles(
  dartClient: CounterCheckDeps['dartClient'],
  corpCode: string | null,
  now: Date,
): Promise<string[]> {
  if (!corpCode) return [];
  try {
    const begin = new Date(now.getTime() - DISCLOSURE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const response = await dartClient.fetchDisclosureList(
      corpCode,
      toYyyymmdd(begin),
      toYyyymmdd(now),
    );
    return extractDisclosureTitles(response);
  } catch {
    return [];
  }
}

export async function runCounterCheck(
  deps: CounterCheckDeps,
  input: CounterCheckInput,
  originalRelevance: number,
): Promise<CounterCheckResult> {
  const fallback: CounterCheckResult = {
    refuted: false,
    reason: null,
    adjustedRelevance: originalRelevance,
  };

  const disclosureTitles = await fetchDisclosureTitles(deps.dartClient, input.corpCode, deps.now);
  const disclosureLoop = (
    disclosureTitles.length > 0 ? disclosureTitles : [NO_DISCLOSURE_PLACEHOLDER]
  ).map((title) => ({ title }));

  const prompt = loadPrompt('counter_check.md');
  const userContent = renderPromptTemplate(
    prompt.userTemplate,
    {
      claim: input.claim,
      company_name: input.companyName,
      ticker: input.ticker,
      business_summary: input.businessSummary ?? '(사업 개요 없음)',
    },
    { disclosures: disclosureLoop },
  );

  const inputHash = computeInputHash([
    input.claim,
    input.companyName,
    input.businessSummary ?? '',
    disclosureTitles.join('|'),
    prompt.promptVersion,
  ]);

  const cached = await findCachedOutput(deps.db, {
    stage: 'COUNTER',
    promptVersion: prompt.promptVersion,
    inputHash,
  });
  if (cached) {
    const parsed = CounterCheckOutputSchema.safeParse(cached);
    if (parsed.success) {
      return parsed.data.refuted
        ? {
            refuted: true,
            reason: parsed.data.reason,
            adjustedRelevance: parsed.data.adjusted_relevance,
          }
        : fallback;
    }
  }

  if (!(await isUnderDailyCap(deps.db, deps.dailyCostCapUsd, deps.now))) return fallback;

  const rates = getModelRates(deps.model);
  try {
    const result = await deps.llmClient.callTool({
      model: deps.model,
      system: prompt.system,
      userContent,
      tool: COUNTER_CHECK_TOOL,
      maxTokens: 512,
      parseOutput: (raw) => {
        const parsed = CounterCheckOutputSchema.safeParse(raw);
        return parsed.success
          ? { success: true as const, data: parsed.data }
          : { success: false as const, error: parsed.error.message };
      },
    });
    await recordLlmRun(deps.db, {
      stage: 'COUNTER',
      promptVersion: prompt.promptVersion,
      model: deps.model,
      inputHash,
      inputRef: { clusterId: input.clusterId, companyId: input.companyId },
      output: result.output,
      usage: result.usage,
      costUsd: computeCostUsd(result.usage, rates),
      latencyMs: result.latencyMs,
      status: 'OK',
    });
    return result.output.refuted
      ? {
          refuted: true,
          reason: result.output.reason,
          adjustedRelevance: result.output.adjusted_relevance,
        }
      : fallback;
  } catch (err) {
    const isValidationError = err instanceof LlmValidationError;
    const usage = isValidationError ? err.usage : { inputTokens: 0, outputTokens: 0 };
    await recordLlmRun(deps.db, {
      stage: 'COUNTER',
      promptVersion: prompt.promptVersion,
      model: deps.model,
      inputHash,
      inputRef: { clusterId: input.clusterId, companyId: input.companyId },
      usage,
      costUsd: computeCostUsd(usage, rates),
      status: isValidationError ? 'INVALID_JSON' : 'ERROR',
      error: String(err),
    });
    return fallback;
  }
}
