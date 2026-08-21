import { describe, expect, it } from 'vitest';
import { computeInputHash } from './input-hash';

describe('computeInputHash', () => {
  it('결정론적이다 (같은 입력 → 같은 해시)', () => {
    const parts = ['headline', 'summary', 'ee-v1'];
    expect(computeInputHash(parts)).toBe(computeInputHash(parts));
  });

  it('64자 hex sha256 문자열을 반환한다', () => {
    const hash = computeInputHash(['a', 'b']);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('부분 문자열 경계가 다르면 다른 해시를 만든다 (구분자로 충돌 방지)', () => {
    const a = computeInputHash(['ab', 'c']);
    const b = computeInputHash(['a', 'bc']);
    expect(a).not.toBe(b);
  });

  it('입력이 하나라도 다르면 해시가 달라진다', () => {
    const a = computeInputHash(['headline1', 'summary', 'ee-v1']);
    const b = computeInputHash(['headline2', 'summary', 'ee-v1']);
    expect(a).not.toBe(b);
  });
});
