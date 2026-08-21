import { NextResponse } from 'next/server';
import { getRefreshClaims, issueSessionCookies } from '../../../../../lib/auth/session';

/** POST /v1/auth/refresh — spec/openapi.yaml. refresh 쿠키로 access 쿠키를 재발급한다. */
export async function POST(): Promise<NextResponse> {
  const claims = await getRefreshClaims();
  if (!claims) {
    return NextResponse.json(
      {
        code: 'REFRESH_INVALID',
        message: 'refresh 쿠키가 없거나 만료됐습니다. 다시 로그인해 주세요.',
      },
      { status: 401 },
    );
  }
  await issueSessionCookies(claims);
  return new NextResponse(null, { status: 204 });
}
