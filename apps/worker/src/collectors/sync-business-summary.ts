/**
 * T1.2.2 — DART 기업개황 → business_summary 생성 + 캐시.
 * DoD: corp_code가 있는 기업만 대상으로 하고, 최근에 갱신한 건 재조회하지
 * 않는다(캐시 — DART 레이트리밋 보호 + 불필요한 호출 방지).
 *
 * 실행: pnpm --filter @gukjang/worker exec tsx src/collectors/sync-business-summary.ts
 */
import { buildBusinessSummary } from '@gukjang/core';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { eq } from 'drizzle-orm';
import { DartClient } from './dart-client';

export interface BusinessSummarySyncResult {
  scanned: number;
  updated: number;
  skippedNoCorpCode: number;
  skippedFresh: number;
  skippedNoData: number;
}

/** 캐시 유효기간 — 기업개황은 자주 바뀌지 않으므로 30일이면 충분하다. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function isFresh(updatedAt: Date | null, now: Date): boolean {
  if (!updatedAt) return false;
  return now.getTime() - updatedAt.getTime() < CACHE_TTL_MS;
}

/**
 * db와 client를 주입받는 형태로 짜서 테스트에서 실제 로컬 postgres + 가짜(client)
 * 조합으로 캐시/upsert 로직 자체를 검증할 수 있게 한다 (sync-krx-listing.ts와 동일 패턴).
 */
export async function syncBusinessSummaries(
  db: ReturnType<typeof getDb>,
  client: Pick<DartClient, 'fetchCompanyOverview'>,
  now: Date = new Date(),
): Promise<BusinessSummarySyncResult> {
  const companies = await db
    .select({
      id: schema.company.id,
      name: schema.company.name,
      market: schema.company.market,
      sector: schema.company.sector,
      corpCode: schema.company.corpCode,
      businessSummaryUpdatedAt: schema.company.businessSummaryUpdatedAt,
    })
    .from(schema.company);

  let updated = 0;
  let skippedNoCorpCode = 0;
  let skippedFresh = 0;
  let skippedNoData = 0;

  for (const c of companies) {
    if (!c.corpCode) {
      skippedNoCorpCode++;
      continue;
    }
    if (isFresh(c.businessSummaryUpdatedAt, now)) {
      skippedFresh++;
      continue;
    }

    const overview = await client.fetchCompanyOverview(c.corpCode);
    if (overview.status === '013') {
      // DART에 데이터가 없음 — 실패가 아니라 "이 회사는 조회 결과가 없다"는 정상 상태.
      skippedNoData++;
      continue;
    }

    const summary = buildBusinessSummary({
      name: c.name,
      market: c.market,
      sector: c.sector ?? undefined,
      overview: { ceo_nm: overview.ceo_nm, est_dt: overview.est_dt },
    });

    await db
      .update(schema.company)
      .set({ businessSummary: summary, businessSummaryUpdatedAt: now })
      .where(eq(schema.company.id, c.id));
    updated++;
  }

  return { scanned: companies.length, updated, skippedNoCorpCode, skippedFresh, skippedNoData };
}

async function main(): Promise<void> {
  const { loadEnv } = await import('@gukjang/core');
  const { getDb: getDbFn, closeDb } = await import('@gukjang/db');
  const env = loadEnv();
  if (!env.DART_API_KEY) {
    console.error('✗ DART_API_KEY가 설정되지 않음 — .env를 확인할 것');
    process.exit(1);
  }
  const db = getDbFn();
  const client = new DartClient({ apiKey: env.DART_API_KEY });
  console.log('business_summary 동기화 시작…');
  const result = await syncBusinessSummaries(db, client);
  console.log(
    `✓ 완료 — scanned=${result.scanned} updated=${result.updated} ` +
      `skippedNoCorpCode=${result.skippedNoCorpCode} skippedFresh=${result.skippedFresh} ` +
      `skippedNoData=${result.skippedNoData}`,
  );
  await closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('✗ business_summary 동기화 실패:', err);
    process.exit(1);
  });
}
