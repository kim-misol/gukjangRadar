/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님).
 * 실 KIS 네트워크/키가 없어(W1/W2와 같은 처지) 진짜 KisClient 대신 픽스처 응답을 반환하는
 * fake client로 syncMarketSnapshots를 **실제 로컬 postgres**에 대해 돌려 T1.3.2 DoD
 * (스냅샷 upsert + volumeRatio20 계산)가 실제로 동작하는지 확인한다.
 *
 * 실행: pnpm --filter @gukjang/db exec tsx ../../scripts/manual-verify-market-snapshot.ts
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import type { KisPriceResponse } from '@gukjang/core';
import { and, eq } from 'drizzle-orm';
import { syncMarketSnapshots } from '../apps/worker/src/collectors/sync-market-snapshot';

const PRICE_FIXTURES: Record<string, KisPriceResponse> = {
  '090350': {
    rt_cd: '0',
    msg_cd: 'MCA00000',
    msg1: '정상처리',
    output: {
      stck_prpr: '18500',
      prdy_vrss: '300',
      prdy_vrss_sign: '2',
      prdy_ctrt: '1.65',
      acml_vol: '520000',
      acml_tr_pbmn: '9600000000',
    },
  },
  '000660': {
    rt_cd: '0',
    msg_cd: 'MCA00000',
    msg1: '정상처리',
    output: {
      stck_prpr: '198000',
      prdy_vrss: '4000',
      prdy_vrss_sign: '5',
      prdy_ctrt: '1.98',
      acml_vol: '3100000',
      acml_tr_pbmn: '613800000000',
    },
  },
};

async function main(): Promise<void> {
  const db = getDb();

  const fakeClient = {
    fetchPrice: async (ticker: string): Promise<KisPriceResponse> => {
      const fixture = PRICE_FIXTURES[ticker];
      if (!fixture) throw new Error(`fixture 없음: ${ticker}`);
      return fixture;
    },
  };

  // 평일 낮 10시(KST)로 고정 — 실행 시점이 주말/야간이어도 OPEN 경로를 확인할 수 있게.
  const marketOpenNow = new Date('2026-08-21T01:00:00Z'); // 2026-08-21(금) 10:00 KST
  const marketClosedNow = new Date('2026-08-22T02:00:00Z'); // 2026-08-22(토) 11:00 KST

  console.log('=== 장중 시각으로 실행 (OPEN 경로) ===');
  const openResult = await syncMarketSnapshots(db, fakeClient, marketOpenNow, new Set());
  console.log(openResult);

  console.log('\n=== 재실행 (멱등성 — 같은 capturedAt이면 신규 insert 0건이어야 함) ===');
  const openResultAgain = await syncMarketSnapshots(db, fakeClient, marketOpenNow, new Set());
  console.log(openResultAgain);

  console.log('\n=== 주말 시각으로 실행 (CLOSED — 아무것도 안 해야 함) ===');
  const closedResult = await syncMarketSnapshots(db, fakeClient, marketClosedNow, new Set());
  console.log(closedResult);

  const [noru] = await db
    .select()
    .from(schema.marketSnapshot)
    .innerJoin(schema.company, eq(schema.company.id, schema.marketSnapshot.companyId))
    .where(
      and(eq(schema.company.ticker, '090350'), eq(schema.marketSnapshot.capturedAt, marketOpenNow)),
    );
  console.log('\n노루페인트 저장 행:', noru);

  await closeDb();
}

main().catch((err) => {
  console.error('✗ 수동 검증 실패:', err);
  process.exit(1);
});
