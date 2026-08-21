/**
 * T1.3.2 — KIS 시세 스냅샷 배치. docs/11-pipeline.md §⑪ "5분 배치, 장중".
 * db와 client를 주입받는 형태로 짜서 실 로컬 postgres + 가짜(client) 조합으로 upsert/
 * volumeRatio20 계산 로직 자체를 검증할 수 있게 한다(sync-business-summary.ts와 동일 패턴).
 *
 * 실행: pnpm --filter @gukjang/worker exec tsx src/collectors/sync-market-snapshot.ts
 */
import {
  computeVolumeRatio20,
  getMarketStatus,
  mapKisPriceResponse,
  FIXED_KRX_HOLIDAYS_2026,
} from '@gukjang/core';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { KisClient } from './kis-client';

export interface MarketSnapshotSyncResult {
  status: ReturnType<typeof getMarketStatus>;
  scanned: number;
  updated: number;
  skippedError: number;
}

/** 최근 20영업일 스냅샷에서 거래일별 마지막(=당일 최신) 거래량만 남긴다. */
async function recentDailyVolumes(
  db: ReturnType<typeof getDb>,
  companyId: number,
  beforeDate: string,
): Promise<number[]> {
  const rows = await db
    .select({ tradeDate: schema.marketSnapshot.tradeDate, volume: schema.marketSnapshot.volume })
    .from(schema.marketSnapshot)
    .where(
      and(
        eq(schema.marketSnapshot.companyId, companyId),
        lt(schema.marketSnapshot.tradeDate, beforeDate),
      ),
    )
    .orderBy(desc(schema.marketSnapshot.capturedAt))
    .limit(200);

  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (r.volume === null) continue;
    if (!byDate.has(r.tradeDate)) byDate.set(r.tradeDate, Number(r.volume));
  }
  return [...byDate.values()].slice(0, 20);
}

export async function syncMarketSnapshots(
  db: ReturnType<typeof getDb>,
  client: Pick<KisClient, 'fetchPrice'>,
  now: Date = new Date(),
  holidays: ReadonlySet<string> = FIXED_KRX_HOLIDAYS_2026,
): Promise<MarketSnapshotSyncResult> {
  const status = getMarketStatus(now, holidays);
  if (status !== 'OPEN') {
    return { status, scanned: 0, updated: 0, skippedError: 0 };
  }

  const companies = await db
    .select({ id: schema.company.id, ticker: schema.company.ticker })
    .from(schema.company)
    .where(eq(schema.company.isListed, true));

  const tradeDate = now.toISOString().slice(0, 10);
  let updated = 0;
  let skippedError = 0;

  for (const c of companies) {
    try {
      const res = await client.fetchPrice(c.ticker);
      if (res.rt_cd !== '0') throw new Error(`KIS 응답 오류(rt_cd=${res.rt_cd}): ${res.msg1}`);

      const mapped = mapKisPriceResponse(res);
      const history = await recentDailyVolumes(db, c.id, tradeDate);
      const volumeRatio20 = computeVolumeRatio20(mapped.volume, history);

      const inserted = await db
        .insert(schema.marketSnapshot)
        .values({
          companyId: c.id,
          capturedAt: now,
          tradeDate,
          price: mapped.price,
          changePct: mapped.changePct.toString(),
          volume: mapped.volume,
          valueTraded: mapped.valueTraded,
          volumeRatio20: volumeRatio20?.toString(),
          // KIS 응답이 실제로는 근실시간이어도, docs/05 S4 규칙("시세는 항상 지연 표기,
          // 실시간처럼 보이는 연출 금지")을 따라 항상 지연으로 표시한다 — R6과 같은 취지.
          isDelayed: true,
        })
        .onConflictDoNothing({
          target: [schema.marketSnapshot.companyId, schema.marketSnapshot.capturedAt],
        })
        .returning({ companyId: schema.marketSnapshot.companyId });
      if (inserted.length > 0) updated++;
    } catch {
      skippedError++;
    }
  }

  return { status, scanned: companies.length, updated, skippedError };
}

async function main(): Promise<void> {
  const { loadEnv } = await import('@gukjang/core');
  const { getDb: getDbFn, closeDb } = await import('@gukjang/db');
  const { KisClient } = await import('./kis-client');
  const env = loadEnv();
  if (!env.KIS_APP_KEY || !env.KIS_APP_SECRET) {
    console.error('✗ KIS_APP_KEY/KIS_APP_SECRET이 설정되지 않음 — .env를 확인할 것');
    process.exit(1);
  }
  const db = getDbFn();
  const client = new KisClient({ appKey: env.KIS_APP_KEY, appSecret: env.KIS_APP_SECRET });
  console.log('시세 스냅샷 동기화 시작…');
  const result = await syncMarketSnapshots(db, client);
  console.log(
    `✓ 완료 — status=${result.status} scanned=${result.scanned} updated=${result.updated} skippedError=${result.skippedError}`,
  );
  await closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('✗ 시세 스냅샷 동기화 실패:', err);
    process.exit(1);
  });
}
