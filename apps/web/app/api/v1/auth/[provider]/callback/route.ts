import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { OAUTH_PROVIDERS, type OAuthProvider } from '@gukjang/spec';
import { exchangeAndFetchProfile } from '../../../../../../lib/auth/oauth';
import { consumeStateCookie } from '../../../../../../lib/auth/state';
import { issueSessionCookies } from '../../../../../../lib/auth/session';
import { upsertOAuthUser } from '../../../../../../lib/api/auth';

const PROVIDER_SET = new Set<string>(OAUTH_PROVIDERS);

/** GET /v1/auth/{provider}/callback — spec/openapi.yaml. 코드 교환 → app_user upsert → 세션 쿠키 발급. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!PROVIDER_SET.has(provider)) {
    return NextResponse.json(
      {
        code: 'UNSUPPORTED_PROVIDER',
        message: `provider는 ${OAUTH_PROVIDERS.join('/')} 중 하나여야 합니다.`,
      },
      { status: 400 },
    );
  }
  if (!code || !state) {
    return NextResponse.json(
      { code: 'MISSING_PARAM', message: 'code/state 쿼리 파라미터가 필요합니다.' },
      { status: 400 },
    );
  }

  const savedState = await consumeStateCookie();
  if (!savedState || savedState !== state) {
    return NextResponse.json(
      { code: 'STATE_MISMATCH', message: 'CSRF state가 일치하지 않습니다. 다시 로그인해 주세요.' },
      { status: 400 },
    );
  }

  let profile;
  try {
    profile = await exchangeAndFetchProfile(provider as OAuthProvider, code);
  } catch (err) {
    return NextResponse.json(
      { code: 'OAUTH_EXCHANGE_FAILED', message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const user = await upsertOAuthUser(
    getDb(),
    provider as OAuthProvider,
    profile.providerUid,
    profile.email,
  );
  await issueSessionCookies({ userId: user.id, plan: user.plan });

  return NextResponse.redirect(new URL('/alerts', request.url));
}
