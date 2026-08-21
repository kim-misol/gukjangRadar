import { describe, expect, it } from 'vitest';
import { signAccessToken, signRefreshToken, verifySessionToken } from './jwt';

describe('jwt 세션 토큰', () => {
  it('access 토큰을 발급하고 access로 검증하면 클레임을 되돌려준다', async () => {
    const token = await signAccessToken({ userId: 42, plan: 'FREE' });
    const claims = await verifySessionToken(token, 'access');
    expect(claims).toEqual({ userId: 42, plan: 'FREE' });
  });

  it('refresh 토큰을 access로 검증하면 실패한다 (타입 혼용 방지)', async () => {
    const token = await signRefreshToken({ userId: 1, plan: 'FREE' });
    expect(await verifySessionToken(token, 'access')).toBeNull();
    expect(await verifySessionToken(token, 'refresh')).toEqual({ userId: 1, plan: 'FREE' });
  });

  it('위조된 토큰은 검증에 실패한다', async () => {
    const token = await signAccessToken({ userId: 1, plan: 'FREE' });
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');
    expect(await verifySessionToken(tampered, 'access')).toBeNull();
  });

  it('빈 문자열/쓰레기 값은 예외를 던지지 않고 null을 반환한다', async () => {
    expect(await verifySessionToken('not-a-jwt', 'access')).toBeNull();
  });
});
