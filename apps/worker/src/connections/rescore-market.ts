/**
 * docs/11-pipeline.md §2 ⑪: "장중 5분 배치로 connection.score 재실행 → 시장 반응 점수만
 * 갱신(LLM 재호출 없음)". 오늘자 ACTIVE/DISPUTED 연결을 대상으로 그 회사의 최신
 * market_snapshot(오늘자)으로 marketReactionScore만 새로 계산하고 connectionScore를
 * 재합성한다. 다른 원본 점수(businessRelevance/keywordMatch/supplyChain/meme/confidence)와
 * hasEvidenceGap/isAmbiguousAlias 플래그는 build-connections.ts가 저장해 둔 값을 그대로
 * 재사용한다(LLM 재판정 없음, docs/13 §4 상한 로직도 최초 판정과 동일하게 유지됨).
 */
import { computeConnectionScore, computeMarketReactionScore } from '@gukjang/core';
import type { MarketReactionConfig, ScoringConfig } from '@gukjang/core';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { and, desc, eq, inArray } from 'drizzle-orm';

export interface RescoreMarketResult {
  scanned: number;
  updated: number;
}

interface SnapshotSummary {
  volumeRatio20: number | null;
  changePct: number | null;
}

async function latestSnapshotsByCompany(
  db: ReturnType<typeof getDb>,
  companyIds: readonly number[],
  tradeDate: string,
): Promise<Map<number, SnapshotSummary>> {
  if (companyIds.length === 0) return new Map();

  const rows = await db
    .select({
      companyId: schema.marketSnapshot.companyId,
      volumeRatio20: schema.marketSnapshot.volumeRatio20,
      changePct: schema.marketSnapshot.changePct,
    })
    .from(schema.marketSnapshot)
    .where(
      and(
        inArray(schema.marketSnapshot.companyId, [...companyIds]),
        eq(schema.marketSnapshot.tradeDate, tradeDate),
      ),
    )
    .orderBy(desc(schema.marketSnapshot.capturedAt));

  const map = new Map<number, SnapshotSummary>();
  for (const r of rows) {
    if (map.has(r.companyId)) continue; // orderBy desc라 처음 만난 행이 최신 스냅샷
    map.set(r.companyId, {
      volumeRatio20: r.volumeRatio20 === null ? null : Number(r.volumeRatio20),
      changePct: r.changePct === null ? null : Number(r.changePct),
    });
  }
  return map;
}

/** ACTIVE/DISPUTED 상태의 오늘자 연결을 최신 시세로 재점수화한다(멱등: 값이 그대로면 UPDATE 생략). */
export async function rescoreConnectionsForMarketReaction(
  db: ReturnType<typeof getDb>,
  scoring: ScoringConfig,
  marketReaction: MarketReactionConfig,
  now: Date = new Date(),
): Promise<RescoreMarketResult> {
  const tradeDate = now.toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: schema.connection.id,
      companyId: schema.connection.companyId,
      connectionType: schema.connection.connectionType,
      hopCount: schema.connection.hopCount,
      businessRelevanceScore: schema.connection.businessRelevanceScore,
      keywordMatchScore: schema.connection.keywordMatchScore,
      supplyChainScore: schema.connection.supplyChainScore,
      memeScore: schema.connection.memeScore,
      confidenceScore: schema.connection.confidenceScore,
      hasEvidenceGap: schema.connection.hasEvidenceGap,
      isAmbiguousAlias: schema.connection.isAmbiguousAlias,
      marketReactionScore: schema.connection.marketReactionScore,
    })
    .from(schema.connection)
    .where(
      and(
        inArray(schema.connection.status, ['ACTIVE', 'DISPUTED']),
        eq(schema.connection.tradeDate, tradeDate),
      ),
    );
  if (rows.length === 0) return { scanned: 0, updated: 0 };

  const snapshots = await latestSnapshotsByCompany(
    db,
    [...new Set(rows.map((r) => r.companyId))],
    tradeDate,
  );

  let updated = 0;
  for (const row of rows) {
    const snapshot = snapshots.get(row.companyId);
    if (!snapshot || snapshot.volumeRatio20 === null || snapshot.changePct === null) continue;

    const marketReactionScore = computeMarketReactionScore(
      { volumeRatio20: snapshot.volumeRatio20, changePct: snapshot.changePct },
      marketReaction,
    );
    if (marketReactionScore === row.marketReactionScore) continue;

    const connectionScore = computeConnectionScore(
      {
        businessRelevance: row.businessRelevanceScore,
        keywordMatch: row.keywordMatchScore,
        supplyChain: row.supplyChainScore,
        marketReaction: marketReactionScore,
        meme: row.memeScore,
        confidence: row.confidenceScore,
      },
      row.connectionType,
      row.hopCount,
      {
        hasEvidenceGap: row.hasEvidenceGap,
        ambiguousAlias: row.isAmbiguousAlias,
        reviewed: false,
      },
      scoring,
    );

    await db
      .update(schema.connection)
      .set({ marketReactionScore, connectionScore, updatedAt: new Date() })
      .where(eq(schema.connection.id, row.id));
    updated++;
  }

  return { scanned: rows.length, updated };
}
