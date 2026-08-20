/**
 * T1.1.1 — KRX 상장회사 목록을 받아 company 테이블에 upsert한다.
 * DoD: 전 종목 적재. (라이브 KRX 응답 검증은 apps/worker/src/collectors/krx-client.ts 상단 참고)
 *
 * 실행: pnpm --filter @gukjang/worker exec tsx src/collectors/sync-krx-listing.ts
 */
import { toCompanyUpsertInput, type CompanyUpsertInput } from '@gukjang/core';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { KrxListingClient } from './krx-client';

export interface SyncResult {
  fetched: number;
  skipped: number;
  upserted: number;
}

/**
 * db와 client를 주입받는 형태로 짜서 테스트에서 실제 로컬 postgres + 가짜(client)
 * 조합으로 upsert 로직 자체는 검증할 수 있게 한다.
 */
export async function syncKrxListing(
  db: ReturnType<typeof getDb>,
  client: Pick<KrxListingClient, 'fetchAll'>,
): Promise<SyncResult> {
  const rawRows = await client.fetchAll();
  const inputs: CompanyUpsertInput[] = [];
  let skipped = 0;

  for (const row of rawRows) {
    const mapped = toCompanyUpsertInput(row);
    if (!mapped) {
      skipped++;
      continue;
    }
    inputs.push(mapped);
  }

  for (const input of inputs) {
    await db
      .insert(schema.company)
      .values({
        ticker: input.ticker,
        isin: input.isin,
        name: input.name,
        nameNorm: input.nameNorm,
        nameJamo: input.nameJamo,
        market: input.market,
        sector: input.sector,
        listedAt: input.listedAt,
      })
      .onConflictDoUpdate({
        target: schema.company.ticker,
        set: {
          name: input.name,
          nameNorm: input.nameNorm,
          nameJamo: input.nameJamo,
          market: input.market,
          sector: input.sector,
          listedAt: input.listedAt,
          updatedAt: new Date(),
        },
      });
  }

  return { fetched: rawRows.length, skipped, upserted: inputs.length };
}

async function main(): Promise<void> {
  const { getDb: getDbFn, closeDb } = await import('@gukjang/db');
  const db = getDbFn();
  const client = new KrxListingClient();
  console.log('KRX 상장회사 목록 수집 시작…');
  const result = await syncKrxListing(db, client);
  console.log(
    `✓ 완료 — fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped}`,
  );
  await closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('✗ KRX 동기화 실패:', err);
    process.exit(1);
  });
}
