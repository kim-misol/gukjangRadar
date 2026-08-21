/**
 * T3.3.1 — JWT 발급/검증 (docs/07 §5: access 15분 / refresh 30일).
 * `jose`는 Edge 런타임에서도 동작해 Next.js Route Handler와 궁합이 좋다.
 */
import { SignJWT, jwtVerify } from 'jose';
import { loadEnv } from '@gukjang/core';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

export interface SessionClaims {
  userId: number;
  plan: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(loadEnv().JWT_SECRET);
}

async function signToken(
  claims: SessionClaims,
  type: 'access' | 'refresh',
  ttlSec: number,
): Promise<string> {
  return new SignJWT({ plan: claims.plan, type })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(claims.userId))
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .sign(secretKey());
}

export function signAccessToken(claims: SessionClaims): Promise<string> {
  return signToken(claims, 'access', ACCESS_TTL_SEC);
}

export function signRefreshToken(claims: SessionClaims): Promise<string> {
  return signToken(claims, 'refresh', REFRESH_TTL_SEC);
}

/** 검증 실패(만료·서명 불일치·타입 불일치)는 예외를 던지지 않고 null을 반환한다 — 호출부는 항상 401로만 처리하면 된다. */
export async function verifySessionToken(
  token: string,
  expectedType: 'access' | 'refresh',
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.type !== expectedType) return null;
    if (typeof payload.sub !== 'string') return null;
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) return null;
    return { userId, plan: typeof payload.plan === 'string' ? payload.plan : 'FREE' };
  } catch {
    return null;
  }
}
