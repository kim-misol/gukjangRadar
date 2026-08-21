/**
 * T2.2.1 — llm_run 기록/조회. docs/11 §3 멱등성 표: "⑤⑥ llm_run.input_hash 재사용",
 * §4: "일일 비용 상한을 환경변수로 두고 초과 시 ⑤⑥부터 스킵한다".
 */
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import type { LlmRunStatus, LlmStage, TokenUsage } from '@gukjang/core';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

export interface RecordLlmRunInput {
  stage: LlmStage;
  promptVersion: string;
  model: string;
  inputHash: string;
  inputRef?: Record<string, unknown>;
  output?: unknown;
  usage?: TokenUsage;
  costUsd?: number;
  latencyMs?: number;
  status: LlmRunStatus;
  error?: string;
}

export async function recordLlmRun(
  db: ReturnType<typeof getDb>,
  input: RecordLlmRunInput,
): Promise<number> {
  const [row] = await db
    .insert(schema.llmRun)
    .values({
      stage: input.stage,
      promptVersion: input.promptVersion,
      model: input.model,
      inputHash: input.inputHash,
      inputRef: input.inputRef,
      output: input.output,
      inputTokens: input.usage?.inputTokens,
      outputTokens: input.usage?.outputTokens,
      costUsd: input.costUsd?.toString(),
      latencyMs: input.latencyMs,
      status: input.status,
      error: input.error,
    })
    .returning({ id: schema.llmRun.id });
  if (!row) throw new Error('llm_run 기록 실패');
  return row.id;
}

/** 같은 (stage, promptVersion, inputHash)로 성공(OK)한 과거 호출이 있으면 그 output을 재사용한다. */
export async function findCachedOutput(
  db: ReturnType<typeof getDb>,
  params: { stage: LlmStage; promptVersion: string; inputHash: string },
): Promise<unknown | null> {
  const [row] = await db
    .select({ output: schema.llmRun.output })
    .from(schema.llmRun)
    .where(
      and(
        eq(schema.llmRun.stage, params.stage),
        eq(schema.llmRun.promptVersion, params.promptVersion),
        eq(schema.llmRun.inputHash, params.inputHash),
        eq(schema.llmRun.status, 'OK'),
      ),
    )
    .orderBy(desc(schema.llmRun.createdAt))
    .limit(1);
  return row ? row.output : null;
}

/** 오늘(UTC 기준 자정부터) 누적 llm_run 비용. */
export async function getTodaySpendUsd(
  db: ReturnType<typeof getDb>,
  now: Date = new Date(),
): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${schema.llmRun.costUsd}), 0)` })
    .from(schema.llmRun)
    .where(gte(schema.llmRun.createdAt, startOfDay));
  return Number(row?.total ?? 0);
}

export async function isUnderDailyCap(
  db: ReturnType<typeof getDb>,
  dailyCapUsd: number,
  now: Date = new Date(),
): Promise<boolean> {
  const spent = await getTodaySpendUsd(db, now);
  return spent < dailyCapUsd;
}
