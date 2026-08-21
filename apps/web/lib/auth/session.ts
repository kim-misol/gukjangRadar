/**
 * T3.3.1 — httpOnly 쿠키 기반 세션 (docs/07 §5).
 * Route Handler에서만 쓴다 — Server Component 렌더링 중에는 쿠키를 set() 할 수 없다(Next.js 제약).
 */
import { cookies } from 'next/headers';
import { loadEnv } from '@gukjang/core';
import {
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
  signAccessToken,
  signRefreshToken,
  verifySessionToken,
  type SessionClaims,
} from './jwt';

export const REFRESH_COOKIE_NAME = 'gr_refresh';

function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}

/** OAuth 콜백 성공 시 access/refresh 쿠키를 함께 발급한다. */
export async function issueSessionCookies(claims: SessionClaims): Promise<void> {
  const env = loadEnv();
  const [access, refresh] = await Promise.all([signAccessToken(claims), signRefreshToken(claims)]);
  const store = await cookies();
  store.set(env.SESSION_COOKIE_NAME, access, cookieOptions(ACCESS_TTL_SEC));
  store.set(REFRESH_COOKIE_NAME, refresh, cookieOptions(REFRESH_TTL_SEC));
}

export async function clearSessionCookies(): Promise<void> {
  const env = loadEnv();
  const store = await cookies();
  store.delete(env.SESSION_COOKIE_NAME);
  store.delete(REFRESH_COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionClaims | null> {
  const env = loadEnv();
  const store = await cookies();
  const token = store.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token, 'access');
}

export async function getRefreshClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(REFRESH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token, 'refresh');
}
