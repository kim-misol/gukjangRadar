import { describe, expect, it } from 'vitest';
import { isAmbiguousAlias } from './ambiguous';

describe('isAmbiguousAlias', () => {
  it('docs/12-edge-cases.md §A1 예시를 모호 별칭으로 판별한다', () => {
    for (const word of ['한샘', '대한', '신라', '삼양', '대성', '태광', '노루']) {
      expect(isAmbiguousAlias(word)).toBe(true);
    }
  });

  it('1글자 별칭은 항상 모호하다 (A4)', () => {
    expect(isAmbiguousAlias('금')).toBe(true);
  });

  it('사전에 없는 고유 사명은 모호하지 않다', () => {
    expect(isAmbiguousAlias('삼성전자')).toBe(false);
    expect(isAmbiguousAlias('원익ips')).toBe(false);
  });
});
