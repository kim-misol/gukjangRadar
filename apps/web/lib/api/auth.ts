/**
 * T3.3.1 — OAuth 콜백에서 app_user를 upsert/조회한다.
 * DB 통합 동작은 유닛테스트 대상이 아니다 (lib/api/queries.ts 상단 원칙과 동일).
 */
import { eq } from 'drizzle-orm';
import { schema, type getDb } from '@gukjang/db';
import type { AppUserDto, OAuthProvider } from '@gukjang/spec';

type Db = ReturnType<typeof getDb>;

function toAppUserDto(row: typeof schema.appUser.$inferSelect): AppUserDto {
  return {
    id: row.id,
    email: row.email,
    provider: row.provider,
    plan: (row.plan as AppUserDto['plan']) ?? 'FREE',
    createdAt: row.createdAt.toISOString(),
  };
}

/** provider+providerUid UNIQUE 제약(app_user_provider_uid_uq)으로 멱등하게 upsert한다. */
export async function upsertOAuthUser(
  db: Db,
  provider: OAuthProvider,
  providerUid: string,
  email: string | null,
): Promise<AppUserDto> {
  const [row] = await db
    .insert(schema.appUser)
    .values({ provider, providerUid, email })
    .onConflictDoUpdate({
      target: [schema.appUser.provider, schema.appUser.providerUid],
      set: { email },
    })
    .returning();
  if (!row) throw new Error('app_user upsert 실패');
  return toAppUserDto(row);
}

export async function getAppUserById(db: Db, id: number): Promise<AppUserDto | null> {
  const [row] = await db.select().from(schema.appUser).where(eq(schema.appUser.id, id)).limit(1);
  return row ? toAppUserDto(row) : null;
}

/**
 * 회원 탈퇴 — `alert_keyword`/`push_subscription`은 `app_user` FK가 `onDelete: 'cascade'`라
 * 함께 삭제된다(schema.ts). 개인정보처리방침 "5. 이용자의 권리"가 약속하는 기능이다.
 */
export async function deleteAppUser(db: Db, id: number): Promise<void> {
  await db.delete(schema.appUser).where(eq(schema.appUser.id, id));
}
