/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-*.ts와 동일한 위치).
 * docs/19-remaining-work.md §3 C12(저장/북마크) 실 검증. 사전 조건: `pnpm --filter @gukjang/web
 * dev`가 localhost:3000에서 실행 중이어야 한다.
 * 실행: pnpm manual-verify-bookmarks
 */
import { getDb, schema } from '@gukjang/db';
import { eq, and } from 'drizzle-orm';
import { loadEnv } from '@gukjang/core';
import { signAccessToken } from '../apps/web/lib/auth/jwt';

const BASE_URL = 'http://localhost:3000';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = getDb();

  const [user] = await db
    .insert(schema.appUser)
    .values({
      provider: 'kakao',
      providerUid: 'w8-bookmark-test',
      email: 'w8-bookmark@example.com',
    })
    .returning();
  if (!user) throw new Error('테스트 유저 생성 실패');
  console.log('[1/6] 테스트 app_user 생성:', user.id);

  const [conn] = await db.select({ id: schema.connection.id }).from(schema.connection).limit(1);
  if (!conn) throw new Error('실 connection 행이 없음 — 시드/파이프라인 먼저 확인');
  const connectionId = conn.id;
  console.log('[2/6] 대상 connection:', connectionId);

  const token = await signAccessToken({ userId: user.id, plan: 'FREE' });
  const cookie = `${env.SESSION_COOKIE_NAME}=${token}`;

  let res = await fetch(`${BASE_URL}/api/v1/connections/${connectionId}/bookmark`, {
    method: 'POST',
    headers: { cookie },
  });
  console.log('[3/6] POST bookmark:', res.status);

  res = await fetch(`${BASE_URL}/api/v1/bookmarks`, { headers: { cookie } });
  const body = (await res.json()) as { items: { id: number }[] };
  console.log('[4/6] GET /v1/bookmarks:', res.status, 'items:', body.items.length);
  const found = body.items.some((c) => c.id === connectionId);

  const dupe = await fetch(`${BASE_URL}/api/v1/connections/${connectionId}/bookmark`, {
    method: 'POST',
    headers: { cookie },
  });
  const [rows] = [
    await db
      .select()
      .from(schema.bookmark)
      .where(
        and(eq(schema.bookmark.userId, user.id), eq(schema.bookmark.connectionId, connectionId)),
      ),
  ];
  console.log(
    '[5/6] 중복 POST(멱등):',
    dupe.status,
    '| bookmark 테이블 행 수(1이어야 함):',
    rows.length,
  );

  res = await fetch(`${BASE_URL}/api/v1/connections/${connectionId}/bookmark`, {
    method: 'DELETE',
    headers: { cookie },
  });
  const afterDelete = await db
    .select()
    .from(schema.bookmark)
    .where(
      and(eq(schema.bookmark.userId, user.id), eq(schema.bookmark.connectionId, connectionId)),
    );
  console.log('[6/6] DELETE bookmark:', res.status, '| 남은 행:', afterDelete.length);

  await db.delete(schema.appUser).where(eq(schema.appUser.id, user.id));
  console.log('cleanup 완료');

  const ok = found && rows.length === 1 && afterDelete.length === 0;
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
