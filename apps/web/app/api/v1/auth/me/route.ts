import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { clearSessionCookies, getSessionUser } from '../../../../../lib/auth/session';
import { deleteAppUser, getAppUserById } from '../../../../../lib/api/auth';

/** GET /v1/auth/me — spec/openapi.yaml. */
export async function GET(): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }
  const user = await getAppUserById(getDb(), session.userId);
  if (!user) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '사용자를 찾을 수 없습니다.' },
      { status: 401 },
    );
  }
  return NextResponse.json(user);
}

/** DELETE /v1/auth/me — 회원 탈퇴(개인정보처리방침 §5). alert_keyword/push_subscription은 cascade. */
export async function DELETE(): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }
  await deleteAppUser(getDb(), session.userId);
  await clearSessionCookies();
  return new NextResponse(null, { status: 204 });
}
