import { NextResponse } from 'next/server';
import { OAUTH_PROVIDERS, type OAuthProvider } from '@gukjang/spec';
import { buildAuthorizeUrl } from '../../../../../lib/auth/oauth';
import { generateState, setStateCookie } from '../../../../../lib/auth/state';

const PROVIDER_SET = new Set<string>(OAUTH_PROVIDERS);

/** GET /v1/auth/{provider} — spec/openapi.yaml. provider 동의 화면으로 리다이렉트한다. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await params;
  if (!PROVIDER_SET.has(provider)) {
    return NextResponse.json(
      {
        code: 'UNSUPPORTED_PROVIDER',
        message: `provider는 ${OAUTH_PROVIDERS.join('/')} 중 하나여야 합니다.`,
      },
      { status: 400 },
    );
  }

  const state = generateState();
  await setStateCookie(state);
  return NextResponse.redirect(buildAuthorizeUrl(provider as OAuthProvider, state));
}
