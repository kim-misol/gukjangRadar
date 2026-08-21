/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-*.ts와 동일한 위치).
 * docs/19-remaining-work.md §5 T4.5(사용자 피드백 → 자동 상태 승격) 실 검증. 사전 조건:
 * `pnpm --filter @gukjang/web dev`가 localhost:3000에서 실행 중이어야 한다.
 * 실행: pnpm manual-verify-feedback-promotion
 */
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@gukjang/db';
import { setupClusterWithEntity } from './lib/fixtures';

const BASE_URL = 'http://localhost:3000';

async function createDraftConnection(
  db: ReturnType<typeof getDb>,
  clusterId: number,
  companyId: number,
  connectionType: 'DIRECT' | 'THEME',
): Promise<number> {
  const [conn] = await db
    .insert(schema.connection)
    .values({
      clusterId,
      companyId,
      connectionType,
      tradeDate: '2026-08-21',
      path: [{ nodeId: companyId, kind: 'COMPANY', label: 'fixture' }],
      hopCount: 1,
      businessRelevanceScore: 70,
      keywordMatchScore: 70,
      confidenceScore: 70,
      connectionScore: 70,
      relevanceBand: 'MEDIUM',
      explanation: '피드백 자동승격 검증용 fixture 연결입니다.',
      status: 'ACTIVE',
      scoringVersion: 'sc-v1',
      promptVersion: 'cm-v4',
    })
    .returning({ id: schema.connection.id });
  if (!conn) throw new Error('connection 생성 실패');
  return conn.id;
}

async function postFeedback(connectionId: number, kind: string, anonId: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/api/v1/connections/${connectionId}/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, anonId }),
  });
  return res.status;
}

async function getStatus(
  db: ReturnType<typeof getDb>,
  connectionId: number,
): Promise<string | undefined> {
  const [row] = await db
    .select({ status: schema.connection.status })
    .from(schema.connection)
    .where(eq(schema.connection.id, connectionId));
  return row?.status;
}

async function main(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const [company] = await db.select({ id: schema.company.id }).from(schema.company).limit(1);
  if (!company) throw new Error('실 company 행이 없음 — 시드 먼저 확인');

  // ── 시나리오 1: WRONG 3건 → PENDING(즉시 노출 중단) ──────────────────────
  const fx1 = await setupClusterWithEntity(db, now, {
    urlSuffix: 'feedback-promotion-wrong',
    headline: '피드백 승격 검증 기사 1',
    entityName: '피드백검증개체WRONG',
    entityKind: 'WORD',
  });
  const wrongConnId = await createDraftConnection(db, fx1.clusterId, company.id, 'DIRECT');
  console.log('[1/4] WRONG 시나리오 connection:', wrongConnId, '초기 상태 ACTIVE');

  for (let i = 0; i < 3; i++) {
    const status = await postFeedback(wrongConnId, 'WRONG', `wrong-anon-${i}`);
    console.log(`  WRONG 피드백 ${i + 1}/3 POST 상태코드:`, status);
  }
  const afterWrong = await getStatus(db, wrongConnId);
  console.log('  → 연결 status(PENDING이어야 함):', afterWrong);

  // ── 시나리오 2: FARFETCHED 비율 40%초과 && 표본 20↑ → DISPUTED ──────────
  const fx2 = await setupClusterWithEntity(db, now, {
    urlSuffix: 'feedback-promotion-farfetched',
    headline: '피드백 승격 검증 기사 2',
    entityName: '피드백검증개체FARFETCHED',
    entityKind: 'WORD',
  });
  const disputedConnId = await createDraftConnection(db, fx2.clusterId, company.id, 'THEME');
  console.log('[2/4] FARFETCHED 시나리오 connection:', disputedConnId, '초기 상태 ACTIVE');

  for (let i = 0; i < 11; i++) {
    await postFeedback(disputedConnId, 'UNDERSTOOD', `farfetched-u-${i}`);
  }
  for (let i = 0; i < 9; i++) {
    await postFeedback(disputedConnId, 'FARFETCHED', `farfetched-f-${i}`);
  }
  const afterFarfetched = await getStatus(db, disputedConnId);
  console.log(
    '  UNDERSTOOD 11 + FARFETCHED 9 = 표본20, 비율45% → status(DISPUTED이어야 함):',
    afterFarfetched,
  );

  // ── 시나리오 3: 검수 큐(onlyFlagged)에 PENDING/DISPUTED 둘 다 잡히는지 ──
  const queueRes = await fetch(
    `${BASE_URL}/api/v1/admin/review-queue?onlyFlagged=true&minScore=0`,
    { headers: { 'x-admin-token': process.env.ADMIN_API_TOKEN ?? '' } },
  );
  const queueBody = (await queueRes.json()) as { items?: { id: number }[] };
  const queueIds = new Set((queueBody.items ?? []).map((c) => c.id));
  console.log(
    '[3/4] 검수 큐(GET status):',
    queueRes.status,
    '| WRONG 연결 포함:',
    queueIds.has(wrongConnId),
    '| FARFETCHED 연결 포함:',
    queueIds.has(disputedConnId),
  );

  // ── 시나리오 4: connection_review 감사로그 확인 ─────────────────────────
  const reviewRows = await db
    .select({ action: schema.connectionReview.action, reviewer: schema.connectionReview.reviewer })
    .from(schema.connectionReview)
    .where(and(eq(schema.connectionReview.reviewer, 'system:feedback-promotion')));
  const hasAutoPending = reviewRows.some((r) => r.action === 'AUTO_PENDING');
  const hasAutoDisputed = reviewRows.some((r) => r.action === 'AUTO_DISPUTED');
  console.log(
    '[4/4] connection_review 감사로그 — AUTO_PENDING 존재:',
    hasAutoPending,
    '| AUTO_DISPUTED 존재:',
    hasAutoDisputed,
  );

  // cleanup
  await db.delete(schema.connection).where(eq(schema.connection.id, wrongConnId));
  await db.delete(schema.connection).where(eq(schema.connection.id, disputedConnId));
  await db.delete(schema.newsCluster).where(eq(schema.newsCluster.id, fx1.clusterId));
  await db.delete(schema.newsCluster).where(eq(schema.newsCluster.id, fx2.clusterId));
  console.log('cleanup 완료');

  const ok =
    afterWrong === 'PENDING' &&
    afterFarfetched === 'DISPUTED' &&
    queueIds.has(wrongConnId) &&
    queueIds.has(disputedConnId) &&
    hasAutoPending &&
    hasAutoDisputed;
  if (!ok) {
    console.error('✗ 일부 검증 실패');
    process.exit(1);
  }
  console.log('✓ 전체 검증 통과');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
