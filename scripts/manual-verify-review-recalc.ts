/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-*.ts와 동일한 위치).
 * docs/19-remaining-work.md §5 "관리자 승인 시 connection_score 상한(95) 재계산" 실 검증
 * (docs/10-scoring.md §8, apps/web/lib/api/admin.ts submitConnectionReview).
 * 사전 조건: `pnpm --filter @gukjang/web dev`가 localhost:3000에서 실행 중이어야 한다.
 *
 * 확인 항목:
 *  1) APPROVE — 미검수 상한(95)에 걸려 있던 연결이 승인되면 실제 계산값(100)까지 풀린다.
 *  2) CORRECT — businessRelevance를 낮게 정정하면 relevanceBand도 함께 갱신되고,
 *     connectionScore도 새 businessRelevance + reviewed:true로 재계산된다.
 *  3) marketReactionScore가 저장돼 있으면(0이 아니면) null로 취급하지 않고 실제로 계산에
 *     포함된다.
 *
 * 실행: pnpm manual-verify-review-recalc
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import { eq } from 'drizzle-orm';
import { setupClusterWithEntity } from './lib/fixtures';

const BASE_URL = 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? '';

async function createDraftConnection(
  db: ReturnType<typeof getDb>,
  clusterId: number,
  companyId: number,
  overrides: {
    connectionType: 'DIRECT';
    businessRelevanceScore: number;
    keywordMatchScore: number;
    supplyChainScore: number;
    marketReactionScore: number;
    memeScore: number;
    confidenceScore: number;
    connectionScore: number;
    relevanceBand: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  },
): Promise<number> {
  const [conn] = await db
    .insert(schema.connection)
    .values({
      clusterId,
      companyId,
      hopCount: 1,
      tradeDate: '2026-08-21',
      path: [{ nodeId: companyId, kind: 'COMPANY', label: 'fixture' }],
      explanation: '관리자 검수 재계산 검증용 fixture 연결입니다.',
      status: 'PENDING',
      scoringVersion: 'sc-v1',
      promptVersion: 'cm-v4',
      hasEvidenceGap: false,
      isAmbiguousAlias: false,
      ...overrides,
    })
    .returning({ id: schema.connection.id });
  if (!conn) throw new Error('connection 생성 실패');
  return conn.id;
}

async function review(
  connectionId: number,
  body: { action: string; patch?: { businessRelevance?: number } },
): Promise<number> {
  const res = await fetch(`${BASE_URL}/api/v1/admin/connections/${connectionId}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function readConnection(
  db: ReturnType<typeof getDb>,
  id: number,
): Promise<{ connectionScore: number; relevanceBand: string; status: string }> {
  const [row] = await db
    .select({
      connectionScore: schema.connection.connectionScore,
      relevanceBand: schema.connection.relevanceBand,
      status: schema.connection.status,
    })
    .from(schema.connection)
    .where(eq(schema.connection.id, id));
  if (!row) throw new Error(`connection 조회 실패: ${id}`);
  return row;
}

async function main(): Promise<void> {
  if (!ADMIN_TOKEN) throw new Error('ADMIN_API_TOKEN이 .env에 없음');
  const db = getDb();
  const now = new Date();
  const [company] = await db.select({ id: schema.company.id }).from(schema.company).limit(1);
  if (!company) throw new Error('실 company 행이 없음 — 시드 먼저 확인');

  // ── 1) APPROVE: 상한(95) 해제 확인 — 원점수는 100인데 미검수라 95로 저장돼 있던 상태 ──
  const fx1 = await setupClusterWithEntity(db, now, {
    urlSuffix: 'review-recalc-approve',
    headline: '검수 재계산 검증 기사 1',
    entityName: '검수재계산검증개체1',
    entityKind: 'WORD',
  });
  const approveId = await createDraftConnection(db, fx1.clusterId, company.id, {
    connectionType: 'DIRECT',
    businessRelevanceScore: 100,
    keywordMatchScore: 100,
    supplyChainScore: 100,
    marketReactionScore: 0,
    memeScore: 100,
    confidenceScore: 100,
    connectionScore: 95, // build-connections.ts가 unreviewedHighScore 상한으로 저장했을 값
    relevanceBand: 'HIGH',
  });
  const statusCode1 = await review(approveId, { action: 'APPROVE' });
  const afterApprove = await readConnection(db, approveId);
  console.log(
    '[1/3] APPROVE 응답:',
    statusCode1,
    '| connectionScore(기대 100, 상한 해제):',
    afterApprove.connectionScore,
    '| status:',
    afterApprove.status,
  );

  // ── 2) CORRECT: businessRelevance 하향 정정 → relevanceBand+connectionScore 동반 재계산 ──
  const fx2 = await setupClusterWithEntity(db, now, {
    urlSuffix: 'review-recalc-correct',
    headline: '검수 재계산 검증 기사 2',
    entityName: '검수재계산검증개체2',
    entityKind: 'WORD',
  });
  const correctId = await createDraftConnection(db, fx2.clusterId, company.id, {
    connectionType: 'DIRECT',
    businessRelevanceScore: 90,
    keywordMatchScore: 90,
    supplyChainScore: 0,
    marketReactionScore: 0,
    memeScore: 0,
    confidenceScore: 90,
    connectionScore: 61,
    relevanceBand: 'HIGH',
  });
  const statusCode2 = await review(correctId, {
    action: 'CORRECT',
    patch: { businessRelevance: 20 },
  });
  const afterCorrect = await readConnection(db, correctId);
  console.log(
    '[2/3] CORRECT(businessRelevance→20) 응답:',
    statusCode2,
    '| relevanceBand(기대 LOW):',
    afterCorrect.relevanceBand,
    '| connectionScore(기대 29):',
    afterCorrect.connectionScore,
  );

  // ── 3) marketReactionScore가 0이 아니면 실제로 계산에 포함되는지 ─────────────
  const fx3 = await setupClusterWithEntity(db, now, {
    urlSuffix: 'review-recalc-market',
    headline: '검수 재계산 검증 기사 3',
    entityName: '검수재계산검증개체3',
    entityKind: 'WORD',
  });
  const marketId = await createDraftConnection(db, fx3.clusterId, company.id, {
    connectionType: 'DIRECT',
    businessRelevanceScore: 90,
    keywordMatchScore: 90,
    supplyChainScore: 0,
    marketReactionScore: 60,
    memeScore: 0,
    confidenceScore: 90,
    connectionScore: 60,
    relevanceBand: 'HIGH',
  });
  const statusCode3 = await review(marketId, { action: 'APPROVE' });
  const afterMarket = await readConnection(db, marketId);
  console.log(
    '[3/3] APPROVE(marketReactionScore=60 포함) 응답:',
    statusCode3,
    '| connectionScore(기대 60, marketReaction 반영):',
    afterMarket.connectionScore,
  );

  // cleanup
  await db.delete(schema.connection).where(eq(schema.connection.id, approveId));
  await db.delete(schema.connection).where(eq(schema.connection.id, correctId));
  await db.delete(schema.connection).where(eq(schema.connection.id, marketId));
  await db.delete(schema.newsCluster).where(eq(schema.newsCluster.id, fx1.clusterId));
  await db.delete(schema.newsCluster).where(eq(schema.newsCluster.id, fx2.clusterId));
  await db.delete(schema.newsCluster).where(eq(schema.newsCluster.id, fx3.clusterId));
  console.log('cleanup 완료');

  const ok =
    afterApprove.connectionScore === 100 &&
    afterApprove.status === 'ACTIVE' &&
    afterCorrect.relevanceBand === 'LOW' &&
    afterCorrect.connectionScore === 29 &&
    afterMarket.connectionScore === 60;
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
