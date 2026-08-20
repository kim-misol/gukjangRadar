import { describe, expect, it } from 'vitest';
import { levenshtein, jamoSimilarity, sharesFirstSyllable } from './similarity';

describe('levenshtein', () => {
  it('동일 시퀀스는 거리 0', () => {
    expect(levenshtein(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
  });

  it('빈 시퀀스는 상대 길이만큼의 거리', () => {
    expect(levenshtein([], ['a', 'b'])).toBe(2);
    expect(levenshtein(['a', 'b', 'c'], [])).toBe(3);
  });
});

describe('jamoSimilarity', () => {
  // docs/09 §2: "원희 = ㅇㅜㅓㄴㅎㅢ(6) 원익 = ㅇㅜㅓㄴㅇㅣㄱ(7) lev=3 → sim ≈ 0.57"
  it('원희 vs 원익 ≈ 0.57 (문서 예시와 일치)', () => {
    expect(jamoSimilarity('원희', '원익')).toBeCloseTo(1 - 3 / 7, 2);
  });

  it('동일 문자열은 1', () => {
    expect(jamoSimilarity('노루페인트', '노루페인트')).toBe(1);
  });

  it('완전히 다른 문자열은 낮은 유사도', () => {
    expect(jamoSimilarity('삼성전자', 'SK하이닉스')).toBeLessThan(0.3);
  });

  it('0.6 임계값: 노루/노루페인트처럼 접두 관계는 상대적으로 높은 유사도', () => {
    const sim = jamoSimilarity('노루', '노루페인트');
    expect(sim).toBeGreaterThan(0.3);
  });
});

describe('sharesFirstSyllable', () => {
  it('원희/원익은 첫 음절 "원"을 공유한다', () => {
    expect(sharesFirstSyllable('원희', '원익')).toBe(true);
  });

  it('첫 음절이 다르면 false', () => {
    expect(sharesFirstSyllable('노루', '원익')).toBe(false);
  });
});
