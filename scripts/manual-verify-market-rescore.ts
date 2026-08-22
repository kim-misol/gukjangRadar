/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-*.ts와 동일한 위치).
 * docs/19-remaining-work.md §4 "시세 재점수화 배치"(docs/11-pipeline.md §2 ⑪) 실 검증.
 * KIS_APP_KEY가 없는 이 환경에서도(sync-market-snapshot.ts와 같은 처지) market_snapshot을
 * 직접 심어 rescoreConnectionsForMarketReaction 자체(연산+멱등성)를 실 postgres로 확인한다.
 *
 * 확인 항목:
 *  1) 오늘자 ACTIVE 연결 + 오늘자 market_snapshot이 있으면 marketReactionScore/connectionScore가
 *     computeMarketReactionScore/computeConnectionScore와 정확히 같은 값으로 갱신된다.
 *  2) 재실행 시 값이 그대로면 updated 카운트가 0(멱등, UPDATE 자체를 안 함).
 *  3) 시세가 없는 연결(스냅샷 없는 회사)은 건드리지 않는다.
 *  4) tradeDate가 오늘이 아니거나 status가 PENDING/REJECTED/CORRECTED인 연결은 대상에서 빠진다.
 *
 * 실행: pnpm manual-verify-market-rescore
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import { eq } from 'drizzle-orm';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import {
  computeConnectionScore,
  computeMarketReactionScore,
  type MarketReactionConfig,
  type ScoringConfig,
} from '@gukjang/core';
import { rescoreConnectionsForMarketReaction } from '../apps/worker/src/connections/rescore-market';
import { setupClusterWithEntity } from './lib/fixtures';

async function main(): Promise<void> {
  const db = getDb();
  const now = new Date();
  // rescoreConnectionsForMarketReaction이 내부적으로 now로부터 오늘 날짜를 계산하므로
  // fixture도 반드시 같은 방식으로 맞춰야 한다 — 하드코딩된 날짜 문자열은 실행 시점의
  // 실제 날짜와 어긋나는 순간(예: 자정을 넘기면) scanned:0으로 조용히 실패한다
  // (2026-08-22 실제로 재현된 버그 — 하드코딩 대신 항상 now에서 유도할 것).
  const TODAY = now.toISOString().slice(0, 10);
  const scoring = scoringConfig as unknown as ScoringConfig;
  const marketReaction = scoringConfig.marketReaction as MarketReactionConfig;

  // 이 개발 DB엔 다른 검증 세션이 남긴 실 connection/market_snapshot이 이미 쌓여 있다.
  // rescoreConnectionsForMarketReaction은 companyId로만 스냅샷을 매칭하므로, 기존 실
  // connection이 하나라도 있는 회사를 골랐다간 그 회사의 다른 실 데이터까지 같이
  // 갱신돼버린다 — connection이 전혀 없는 회사 2곳만 골라 완전히 격리한다.
  const companiesWithConnections = new Set(
    (await db.select({ companyId: schema.connection.companyId }).from(schema.connection)).map(
      (r) => r.companyId,
    ),
  );
  const allCompanies = await db.select({ id: schema.company.id }).from(schema.company);
  const freeCompanies = allCompanies.filter((c) => !companiesWithConnections.has(c.id));
  if (freeCompanies.length < 2) throw new Error('connection이 전혀 없는 company가 최소 2개 필요');
  const [withSnapshot, withoutSnapshot] = freeCompanies;

  const fx = await setupClusterWithEntity(db, now, {
    urlSuffix: 'market-rescore',
    headline: '시세 재점수화 검증 기사',
    entityName: '시세재점수화검증개체',
    entityKind: 'WORD',
  });

  const baseConn = {
    clusterId: fx.clusterId,
    tradeDate: TODAY,
    path: [{ nodeId: 1, kind: 'COMPANY' as const, label: 'fixture' }],
    hopCount: 1,
    businessRelevanceScore: 70,
    keywordMatchScore: 60,
    supplyChainScore: 0,
    memeScore: 20,
    confidenceScore: 80,
    hasEvidenceGap: false,
    isAmbiguousAlias: false,
    explanation: '시세 재점수화 검증용 fixture 연결입니다.',
    status: 'ACTIVE' as const,
    scoringVersion: 'sc-v1',
    promptVersion: 'cm-v4',
  };

  // 초기 connectionScore는 marketReaction=null 상태로 미리 계산해 둔다(최초 build 시점과 동일).
  const initialConnectionScore = computeConnectionScore(
    {
      businessRelevance: baseConn.businessRelevanceScore,
      keywordMatch: baseConn.keywordMatchScore,
      supplyChain: baseConn.supplyChainScore,
      marketReaction: null,
      meme: baseConn.memeScore,
      confidence: baseConn.confidenceScore,
    },
    'DIRECT',
    baseConn.hopCount,
    { hasEvidenceGap: false, ambiguousAlias: false, reviewed: false },
    scoring,
  );

  const [connWithSnapshot] = await db
    .insert(schema.connection)
    .values({
      ...baseConn,
      companyId: withSnapshot!.id,
      connectionType: 'DIRECT',
      marketReactionScore: 0,
      connectionScore: initialConnectionScore,
      relevanceBand: 'MEDIUM',
    })
    .returning({ id: schema.connection.id });
  const [connWithoutSnapshot] = await db
    .insert(schema.connection)
    .values({
      ...baseConn,
      companyId: withoutSnapshot!.id,
      connectionType: 'THEME',
      marketReactionScore: 0,
      connectionScore: initialConnectionScore,
      relevanceBand: 'MEDIUM',
    })
    .returning({ id: schema.connection.id });
  console.log(
    '[1/5] fixture 연결 2건 생성 — 시세 있음:',
    connWithSnapshot!.id,
    '/ 시세 없음:',
    connWithoutSnapshot!.id,
  );

  const snapshotInput = { volumeRatio20: 3.2, changePct: -4.8 };
  await db.insert(schema.marketSnapshot).values({
    companyId: withSnapshot!.id,
    capturedAt: now,
    tradeDate: TODAY,
    price: 50000,
    changePct: snapshotInput.changePct.toString(),
    volume: 1_000_000,
    valueTraded: 50_000_000_000,
    volumeRatio20: snapshotInput.volumeRatio20.toString(),
    isDelayed: true,
  });
  console.log('[2/5] market_snapshot 1건 심음 (거래량비 3.2배, 등락 -4.8%)');

  const result1 = await rescoreConnectionsForMarketReaction(db, scoring, marketReaction, now);
  console.log('[3/5] 1차 재점수화 결과:', result1);

  const expectedMr = computeMarketReactionScore(snapshotInput, marketReaction);
  const expectedConnScore = computeConnectionScore(
    {
      businessRelevance: baseConn.businessRelevanceScore,
      keywordMatch: baseConn.keywordMatchScore,
      supplyChain: baseConn.supplyChainScore,
      marketReaction: expectedMr,
      meme: baseConn.memeScore,
      confidence: baseConn.confidenceScore,
    },
    'DIRECT',
    baseConn.hopCount,
    { hasEvidenceGap: false, ambiguousAlias: false, reviewed: false },
    scoring,
  );

  const [afterWith] = await db
    .select({
      marketReactionScore: schema.connection.marketReactionScore,
      connectionScore: schema.connection.connectionScore,
    })
    .from(schema.connection)
    .where(eq(schema.connection.id, connWithSnapshot!.id));
  const [afterWithout] = await db
    .select({
      marketReactionScore: schema.connection.marketReactionScore,
      connectionScore: schema.connection.connectionScore,
    })
    .from(schema.connection)
    .where(eq(schema.connection.id, connWithoutSnapshot!.id));

  console.log(
    `  시세 있는 연결 — marketReactionScore(기대 ${expectedMr}):`,
    afterWith!.marketReactionScore,
    `| connectionScore(기대 ${expectedConnScore}):`,
    afterWith!.connectionScore,
  );
  console.log(
    '  시세 없는 연결(변화 없어야 함) — marketReactionScore:',
    afterWithout!.marketReactionScore,
    '| connectionScore:',
    afterWithout!.connectionScore,
  );

  const result2 = await rescoreConnectionsForMarketReaction(db, scoring, marketReaction, now);
  console.log('[4/5] 2차 재점수화(멱등, updated=0이어야 함):', result2);

  // cleanup
  await db.delete(schema.connection).where(eq(schema.connection.id, connWithSnapshot!.id));
  await db.delete(schema.connection).where(eq(schema.connection.id, connWithoutSnapshot!.id));
  await db
    .delete(schema.marketSnapshot)
    .where(eq(schema.marketSnapshot.companyId, withSnapshot!.id));
  await db.delete(schema.newsCluster).where(eq(schema.newsCluster.id, fx.clusterId));
  console.log('[5/5] cleanup 완료');

  const ok =
    afterWith!.marketReactionScore === expectedMr &&
    afterWith!.connectionScore === expectedConnScore &&
    afterWithout!.marketReactionScore === 0 &&
    afterWithout!.connectionScore === initialConnectionScore &&
    result1.updated === 1 &&
    result2.updated === 0;
  if (!ok) {
    console.error('✗ 일부 검증 실패');
    process.exit(1);
  }
  console.log('✓ 전체 검증 통과');
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
