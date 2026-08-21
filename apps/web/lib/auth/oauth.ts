/**
 * T3.3.1 — 카카오/구글 OAuth2 Authorization Code 플로우.
 * 실 KAKAO_CLIENT_ID/GOOGLE_CLIENT_ID 발급 전까지는 라이브 검증 불가 — docs/15-build-order.md W8 참고.
 */
import { loadEnv } from '@gukjang/core';
import type { OAuthProvider } from '@gukjang/spec';

export interface OAuthProfile {
  providerUid: string;
  email: string | null;
}

function redirectUri(provider: OAuthProvider): string {
  const env = loadEnv();
  const site = env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return `${site}/api/v1/auth/${provider}/callback`;
}

export function buildAuthorizeUrl(provider: OAuthProvider, state: string): string {
  const env = loadEnv();
  if (provider === 'kakao') {
    const params = new URLSearchParams({
      client_id: env.KAKAO_CLIENT_ID ?? '',
      redirect_uri: redirectUri(provider),
      response_type: 'code',
      state,
    });
    return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
  }
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri(provider),
    response_type: 'code',
    scope: 'openid email',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
}

async function exchangeCode(provider: OAuthProvider, code: string): Promise<string> {
  const env = loadEnv();
  const tokenUrl =
    provider === 'kakao'
      ? 'https://kauth.kakao.com/oauth/token'
      : 'https://oauth2.googleapis.com/token';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: (provider === 'kakao' ? env.KAKAO_CLIENT_ID : env.GOOGLE_CLIENT_ID) ?? '',
    client_secret:
      (provider === 'kakao' ? env.KAKAO_CLIENT_SECRET : env.GOOGLE_CLIENT_SECRET) ?? '',
    redirect_uri: redirectUri(provider),
    code,
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`${provider} 토큰 교환 실패: HTTP ${res.status}`);
  }
  const json = (await res.json()) as TokenResponse;
  return json.access_token;
}

async function fetchProfile(provider: OAuthProvider, accessToken: string): Promise<OAuthProfile> {
  if (provider === 'kakao') {
    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`카카오 프로필 조회 실패: HTTP ${res.status}`);
    const json = (await res.json()) as { id: number; kakao_account?: { email?: string } };
    return { providerUid: String(json.id), email: json.kakao_account?.email ?? null };
  }
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`구글 프로필 조회 실패: HTTP ${res.status}`);
  const json = (await res.json()) as { sub: string; email?: string };
  return { providerUid: json.sub, email: json.email ?? null };
}

export async function exchangeAndFetchProfile(
  provider: OAuthProvider,
  code: string,
): Promise<OAuthProfile> {
  const accessToken = await exchangeCode(provider, code);
  return fetchProfile(provider, accessToken);
}
