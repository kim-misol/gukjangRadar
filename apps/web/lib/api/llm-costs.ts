/**
 * T5(D5) — LLM 비용 모니터. docs/19-remaining-work.md §2: 일일 상한 집행(SKIPPED)은
 * 이미 있었지만 "모니터"라 부를 만한 조회 화면이 없었다. DB 통합 동작은 유닛테스트
 * 대상이 아니다(lib/api/queries.ts 상단 원칙과 동일).
 */
import { and, desc, gte, sql } from 'drizzle-orm';
import { schema, type getDb } from '@gukjang/db';

type Db = ReturnType<typeof getDb>;

export interface LlmCostBreakdown {
  key: string;
  costUsd: number;
  runCount: number;
}

export interface LlmCostSummary {
  dailyCapUsd: number;
  today: {
    totalCostUsd: number;
    byStage: LlmCostBreakdown[];
    byModel: LlmCostBreakdown[];
    byStatus: { status: string; runCount: number }[];
  };
  last7Days: { date: string; costUsd: number }[];
}

function startOfDayUtc(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getLlmCostSummary(
  db: Db,
  dailyCapUsd: number,
  now: Date = new Date(),
): Promise<LlmCostSummary> {
  const todayStart = startOfDayUtc(now);
  const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

  const byStageRows = await db
    .select({
      key: schema.llmRun.stage,
      costUsd: sql<string>`COALESCE(SUM(${schema.llmRun.costUsd}), 0)`,
      runCount: sql<number>`count(*)::int`,
    })
    .from(schema.llmRun)
    .where(gte(schema.llmRun.createdAt, todayStart))
    .groupBy(schema.llmRun.stage);

  const byModelRows = await db
    .select({
      key: schema.llmRun.model,
      costUsd: sql<string>`COALESCE(SUM(${schema.llmRun.costUsd}), 0)`,
      runCount: sql<number>`count(*)::int`,
    })
    .from(schema.llmRun)
    .where(gte(schema.llmRun.createdAt, todayStart))
    .groupBy(schema.llmRun.model);

  const byStatusRows = await db
    .select({
      status: schema.llmRun.status,
      runCount: sql<number>`count(*)::int`,
    })
    .from(schema.llmRun)
    .where(gte(schema.llmRun.createdAt, todayStart))
    .groupBy(schema.llmRun.status);

  const last7DaysRows = await db
    .select({
      date: sql<string>`to_char(${schema.llmRun.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      costUsd: sql<string>`COALESCE(SUM(${schema.llmRun.costUsd}), 0)`,
    })
    .from(schema.llmRun)
    .where(and(gte(schema.llmRun.createdAt, sevenDaysAgo)))
    .groupBy(sql`1`)
    .orderBy(desc(sql`1`));

  const totalCostUsd = byStageRows.reduce((sum, r) => sum + Number(r.costUsd), 0);

  return {
    dailyCapUsd,
    today: {
      totalCostUsd,
      byStage: byStageRows.map((r) => ({
        key: r.key,
        costUsd: Number(r.costUsd),
        runCount: r.runCount,
      })),
      byModel: byModelRows.map((r) => ({
        key: r.key,
        costUsd: Number(r.costUsd),
        runCount: r.runCount,
      })),
      byStatus: byStatusRows,
    },
    last7Days: last7DaysRows.map((r) => ({ date: r.date, costUsd: Number(r.costUsd) })),
  };
}
