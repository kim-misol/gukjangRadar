/**
 * C12(V1.1) 저장/북마크 — docs/19-remaining-work.md §3. connection(연결) 단위로 저장한다.
 * DB 통합 동작은 유닛테스트 대상이 아니다(lib/api/queries.ts 상단 원칙과 동일).
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { schema, type getDb } from '@gukjang/db';
import type { ConnectionDto } from '@gukjang/spec';
import { toConnectionDto } from './mappers';

type Db = ReturnType<typeof getDb>;

export async function createBookmark(
  db: Db,
  userId: number,
  connectionId: number,
): Promise<boolean> {
  const rows = await db
    .insert(schema.bookmark)
    .values({ userId, connectionId })
    .onConflictDoNothing({ target: [schema.bookmark.userId, schema.bookmark.connectionId] })
    .returning({ id: schema.bookmark.id });
  return rows.length > 0;
}

export async function deleteBookmark(db: Db, userId: number, connectionId: number): Promise<void> {
  await db
    .delete(schema.bookmark)
    .where(and(eq(schema.bookmark.userId, userId), eq(schema.bookmark.connectionId, connectionId)));
}

/** 여러 connectionId 중 이 사용자가 이미 북마크한 것의 id 집합 — 카드 목록에 별 표시용. */
export async function getBookmarkedConnectionIds(
  db: Db,
  userId: number,
  connectionIds: readonly number[],
): Promise<Set<number>> {
  if (connectionIds.length === 0) return new Set();
  const rows = await db
    .select({ connectionId: schema.bookmark.connectionId })
    .from(schema.bookmark)
    .where(
      and(
        eq(schema.bookmark.userId, userId),
        inArray(schema.bookmark.connectionId, [...connectionIds]),
      ),
    );
  return new Set(rows.map((r) => r.connectionId));
}

export async function listBookmarkedConnections(db: Db, userId: number): Promise<ConnectionDto[]> {
  const rows = await db
    .select({
      id: schema.connection.id,
      clusterId: schema.connection.clusterId,
      connectionType: schema.connection.connectionType,
      businessRelevanceScore: schema.connection.businessRelevanceScore,
      keywordMatchScore: schema.connection.keywordMatchScore,
      supplyChainScore: schema.connection.supplyChainScore,
      marketReactionScore: schema.connection.marketReactionScore,
      memeScore: schema.connection.memeScore,
      confidenceScore: schema.connection.confidenceScore,
      connectionScore: schema.connection.connectionScore,
      relevanceBand: schema.connection.relevanceBand,
      path: schema.connection.path,
      hopCount: schema.connection.hopCount,
      explanation: schema.connection.explanation,
      caution: schema.connection.caution,
      counterEvidence: schema.connection.counterEvidence,
      dataSources: schema.connection.dataSources,
      status: schema.connection.status,
      companyId: schema.company.id,
      companyTicker: schema.company.ticker,
      companyName: schema.company.name,
      companyMarket: schema.company.market,
      companySector: schema.company.sector,
      bookmarkedAt: schema.bookmark.createdAt,
    })
    .from(schema.bookmark)
    .innerJoin(schema.connection, eq(schema.connection.id, schema.bookmark.connectionId))
    .innerJoin(schema.company, eq(schema.company.id, schema.connection.companyId))
    .where(eq(schema.bookmark.userId, userId))
    .orderBy(desc(schema.bookmark.createdAt));

  return rows.map((r) =>
    toConnectionDto({
      ...r,
      company: {
        id: r.companyId,
        ticker: r.companyTicker,
        name: r.companyName,
        market: r.companyMarket,
        sector: r.companySector,
      },
      market: null,
    }),
  );
}
