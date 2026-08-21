import { describe, expect, it } from 'vitest';
import { simhash32, hammingDistance32 } from './simhash';
import { tokenizeForClustering } from './title-normalize';

describe('simhash32', () => {
  it('결정론적이다 (같은 입력 → 같은 출력)', () => {
    const tokens = tokenizeForClustering('노루페인트 실적 발표');
    expect(simhash32(tokens)).toBe(simhash32(tokens));
  });

  it('32비트 안전 정수 범위 안이다', () => {
    const tokens = tokenizeForClustering('삼성전자 SK하이닉스 반도체 훈풍');
    const hash = simhash32(tokens);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isSafeInteger(hash)).toBe(true);
  });

  it('빈 토큰 목록은 0', () => {
    expect(simhash32([])).toBe(0);
  });

  it('거의 같은 제목(사소한 수정)은 해밍거리가 작다', () => {
    const a = simhash32(tokenizeForClustering('삼성전자 반도체 훈풍 실적 개선'));
    const b = simhash32(tokenizeForClustering('삼성전자 반도체 훈풍에 실적 개선'));
    expect(hammingDistance32(a, b)).toBeLessThanOrEqual(3);
  });

  it('완전히 다른 제목은 해밍거리가 크다', () => {
    const a = simhash32(tokenizeForClustering('삼성전자 3분기 실적 서프라이즈'));
    const b = simhash32(tokenizeForClustering('제주도 폭설로 항공편 무더기 결항'));
    expect(hammingDistance32(a, b)).toBeGreaterThan(3);
  });
});

describe('hammingDistance32', () => {
  it('동일 값은 0', () => {
    expect(hammingDistance32(0b1010, 0b1010)).toBe(0);
  });

  it('비트 하나 차이는 1', () => {
    expect(hammingDistance32(0b1010, 0b1011)).toBe(1);
  });

  it('전부 반전이면 32', () => {
    expect(hammingDistance32(0x00000000, 0xffffffff)).toBe(32);
  });
});
