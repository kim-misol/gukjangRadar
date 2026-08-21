/**
 * T4.3(D4) — 파이프라인 대시보드(지연·실패·비용 중 비용은 D5 llm-costs.ts가 담당,
 * 여기서는 큐 적체·실패 + 가드레일 위반). docs/07 §6이 원래 `GET /internal/health`(워커
 * 내부 API + X-Internal-Token)로 설계해 뒀지만, apps/web은 이미 BFF로 postgres에 직접
 * 붙는 구조라(docs/07 §1) 같은 원칙으로 Redis에도 직접 붙는다 — 워커를 거치는 내부 HTTP
 * 계층을 새로 만들 필요가 없다. DB/Redis 통합 동작은 유닛테스트 대상이 아니다
 * (lib/api/queries.ts 상단 원칙과 동일).
 */
import { Queue } from 'bullmq';
import { desc, gte, sql } from 'drizzle-orm';
import { schema, type getDb } from '@gukjang/db';
import { loadEnv } from '@gukjang/core';

type Db = ReturnType<typeof getDb>;

/** docs/11 §1 큐 목록 그대로. */
const QUEUE_NAMES = [
  'news.collect',
  'news.cluster',
  'news.analyze',
  'connection.build',
  'alert.dispatch',
] as const;

let cachedQueues: Queue[] | null = null;

function getQueues(): Queue[] {
  if (cachedQueues) return cachedQueues;
  const redisUrl = new URL(loadEnv().REDIS_URL);
  const connection = { host: redisUrl.hostname, port: Number(redisUrl.port || 6379) };
  cachedQueues = QUEUE_NAMES.map((name) => new Queue(name, { connection }));
  return cachedQueues;
}

export interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface RecentFailedJob {
  queue: string;
  jobId: string;
  failedReason: string | null;
  timestamp: number | null;
}

export interface GuardrailViolationCount {
  ruleId: string;
  count: number;
}

export interface PipelineHealthSummary {
  queues: QueueHealth[];
  guardrailViolationsToday: GuardrailViolationCount[];
  recentFailedJobs: RecentFailedJob[];
}

function startOfDayUtc(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getPipelineHealth(
  db: Db,
  now: Date = new Date(),
): Promise<PipelineHealthSummary> {
  const queues = getQueues();

  const queueHealth = await Promise.all(
    queues.map(async (q) => {
      const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      return {
        name: q.name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    }),
  );

  const recentFailedJobsNested = await Promise.all(
    queues.map(async (q) => {
      const jobs = await q.getFailed(0, 4);
      return jobs.map((job) => ({
        queue: q.name,
        jobId: job.id ?? '',
        failedReason: job.failedReason ?? null,
        timestamp: job.finishedOn ?? null,
      }));
    }),
  );
  const recentFailedJobs = recentFailedJobsNested
    .flat()
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, 10);

  const todayStart = startOfDayUtc(now);
  const violationRows = await db
    .select({ ruleId: schema.guardrailViolation.ruleId, count: sql<number>`count(*)::int` })
    .from(schema.guardrailViolation)
    .where(gte(schema.guardrailViolation.createdAt, todayStart))
    .groupBy(schema.guardrailViolation.ruleId)
    .orderBy(desc(sql`count(*)`));

  return {
    queues: queueHealth,
    guardrailViolationsToday: violationRows,
    recentFailedJobs,
  };
}
