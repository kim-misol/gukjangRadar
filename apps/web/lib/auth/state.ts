/** OAuth CSRF state — 짧게 사는 httpOnly 쿠키에 담아 콜백에서 대조한다. */
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

const STATE_COOKIE_NAME = 'gr_oauth_state';
const STATE_TTL_SEC = 10 * 60;

export function generateState(): string {
  return randomBytes(16).toString('hex');
}

export async function setStateCookie(state: string): Promise<void> {
  const store = await cookies();
  store.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SEC,
  });
}

/** 콜백에서 1회 대조 후 재사용 방지를 위해 삭제까지 한다. */
export async function consumeStateCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(STATE_COOKIE_NAME)?.value ?? null;
  store.delete(STATE_COOKIE_NAME);
  return value;
}
