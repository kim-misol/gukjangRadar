import { describe, expect, it } from 'vitest';
import { isDangerousEventHeadline, isNegativePersonEventHeadline } from './danger-heuristics';

describe('isDangerousEventHeadline', () => {
  it('G-202: 고속도로 다중 추돌 사고 사상자 발생 → true', () => {
    expect(isDangerousEventHeadline('고속도로 다중 추돌 사고 사상자 발생')).toBe(true);
  });
  it('평범한 실적 뉴스는 false', () => {
    expect(isDangerousEventHeadline('삼성전자 3분기 실적 발표')).toBe(false);
  });
});

describe('isNegativePersonEventHeadline', () => {
  it('G-201: ○○기업 대표 구속영장 청구 → true', () => {
    expect(isNegativePersonEventHeadline('○○기업 대표 구속영장 청구')).toBe(true);
  });
  it('평범한 인물 뉴스는 false', () => {
    expect(isNegativePersonEventHeadline('리센느 원희, 신곡 무대 화제')).toBe(false);
  });
});
