import { describe, expect, it } from 'vitest';
import { computeVolumeRatio20 } from './volume-ratio';

describe('computeVolumeRatio20', () => {
  it('오늘 거래량 ÷ 최근 평균 거래량을 반환한다', () => {
    expect(computeVolumeRatio20(200, [100, 100])).toBe(2);
  });

  it('소수점 둘째 자리까지 반올림한다', () => {
    expect(computeVolumeRatio20(100, [30, 30, 30])).toBe(3.33);
  });

  it('과거 데이터가 없으면 null이다', () => {
    expect(computeVolumeRatio20(100, [])).toBeNull();
  });

  it('평균이 0이면 null이다', () => {
    expect(computeVolumeRatio20(100, [0, 0])).toBeNull();
  });
});
