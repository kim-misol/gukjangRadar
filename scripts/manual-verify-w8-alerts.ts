/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-*.ts와 동일한 위치).
 *
 * docs/15-build-order.md W8 게이트("키워드 등록 → 매칭 뉴스 발생 → 실제 푸시 도착")를
 * 실제 로컬 postgres + 실행 중인 apps/web(localhost:3000) 서버에 대해 확인한다.
 * KAKAO_CLIENT_ID/GOOGLE_CLIENT_ID가 없어 실 OAuth 왕복은 못 하지만, 콜백 이후 로직
 * (JWT 발급 → /v1/alerts CRUD → /v1/push/subscribe → 워커 alert.dispatch)은
 * 세션 쿠키를 직접 서명해 만들어 낸 뒤 실 API/DB로 확인한다.
 *
 * 사전 조건: `pnpm --filter @gukjang/web dev`가 localhost:3000에서 실행 중이어야 한다.
 * 실행: pnpm manual-verify-w8-alerts
 */
import { getDb, schema } from '@gukjang/db';
import { eq, sql } from 'drizzle-orm';
import { loadEnv } from '@gukjang/core';
import { dispatchAlertsForCluster } from '../apps/worker/src/alerts/dispatch-alerts';
import { signAccessToken } from '../apps/web/lib/auth/jwt';

const BASE_URL = 'http://localhost:3000';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = getDb();

  const [user] = await db
    .insert(schema.appUser)
    .values({ provider: 'kakao', providerUid: 'w8-verify-test', email: 'w8-verify@example.com' })
    .returning();
  if (!user) throw new Error('테스트 유저 생성 실패');
  console.log(`[1/7] 테스트 app_user 생성: id=${user.id}`);

  const accessToken = await signAccessToken({ userId: user.id, plan: 'FREE' });
  const cookie = `${env.SESSION_COOKIE_NAME}=${accessToken}`;

  let res = await fetch(`${BASE_URL}/api/v1/alerts`, { headers: { cookie } });
  console.log('[2/7] GET /v1/alerts (빈 목록):', res.status, await res.json());

  res = await fetch(`${BASE_URL}/api/v1/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ keyword: '삼성전자', minScore: 40, includeMeme: true }),
  });
  const created = (await res.json()) as { id: number };
  console.log('[3/7] POST /v1/alerts (등록):', res.status, created);

  res = await fetch(`${BASE_URL}/api/v1/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      endpoint: 'https://fcm.googleapis.com/fcm/send/w8-verify-fake-endpoint',
      keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
    }),
  });
  console.log('[4/7] POST /v1/push/subscribe:', res.status);

  // 키워드("삼성전자")가 실제로 매칭되도록 헤드라인에 그 이름이 들어간 ACTIVE 연결을 고른다
  // (임의의 첫 ACTIVE 연결을 쓰면 다른 회사라 매칭이 안 돼 검증이 무의미해진다).
  const [sample] = await db
    .select({ clusterId: schema.connection.clusterId, headline: schema.newsCluster.headline })
    .from(schema.connection)
    .innerJoin(schema.newsCluster, eq(schema.newsCluster.id, schema.connection.clusterId))
    .where(eq(schema.connection.status, 'ACTIVE'))
    .orderBy(sql`${schema.newsCluster.headline} ilike '%삼성전자%' desc`)
    .limit(1);
  if (!sample || !sample.headline.includes('삼성전자')) {
    console.log(
      '[5/7] "삼성전자" 헤드라인을 가진 ACTIVE 연결이 없어 alert.dispatch 매칭 검증을 건너뜁니다.',
    );
  } else {
    const sentPayloads: unknown[] = [];
    const summary = await dispatchAlertsForCluster(
      {
        db,
        now: new Date('2026-08-21T04:00:00Z'), // KST 13:00 — 평시
        sendPush: async (subscription, payload) => {
          sentPayloads.push({ subscription, payload });
          return { ok: false, statusCode: 410 }; // 가짜 endpoint이므로 실패를 흉내
        },
      },
      sample.clusterId,
    );
    console.log('[5/7] dispatchAlertsForCluster (1차):', summary, sentPayloads);

    const remainingSubs = await db
      .select()
      .from(schema.pushSubscription)
      .where(eq(schema.pushSubscription.userId, user.id));
    console.log(
      `      410 응답 후 구독 정리 확인: ${remainingSubs.length === 0 ? 'OK (정리됨)' : 'FAIL (안 지워짐)'}`,
    );

    const summary2 = await dispatchAlertsForCluster(
      { db, now: new Date('2026-08-21T04:05:00Z'), sendPush: async () => ({ ok: true }) },
      sample.clusterId,
    );
    console.log(
      `[6/7] dispatchAlertsForCluster (재실행, dedup 기대):`,
      summary2,
      summary2.sent === 0 ? 'OK (중복 발송 안 함)' : 'FAIL',
    );
  }

  res = await fetch(`${BASE_URL}/api/v1/alerts/${created.id}`, {
    method: 'DELETE',
    headers: { cookie },
  });
  console.log('[7/7] DELETE /v1/alerts/{id}:', res.status);

  await db.delete(schema.appUser).where(eq(schema.appUser.id, user.id));
  console.log('cleanup: 테스트 app_user 삭제 완료 (cascade)');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
