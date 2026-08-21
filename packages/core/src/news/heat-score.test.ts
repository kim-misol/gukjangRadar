import { describe, expect, it } from 'vitest';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import { computeHeatScore } from './heat-score';
import type { HeatScoreConfig } from './types';

const config = scoringConfig.heatScore as HeatScoreConfig;

describe('computeHeatScore', () => {
  it('spec/scoring.config.json의 실제 계수로 문서 공식을 그대로 재현한다', () => {
    // log2(4)=2 → 2×20=40, tier1 보너스 15, 속도 0 → 55
    expect(
      computeHeatScore({ articleCount: 4, sourceTierMin: 1, recentHourIncrease: 0 }, config),
    ).toBe(55);
  });

  it('기사 1건(신규 클러스터)은 log 항이 0이라 tierBonus만 남는다', () => {
    expect(
      computeHeatScore({ articleCount: 1, sourceTierMin: 2, recentHourIncrease: 0 }, config),
    ).toBe(8);
  });

  it('기사 수가 많을수록 점수가 오른다', () => {
    const low = computeHeatScore(
      { articleCount: 2, sourceTierMin: 3, recentHourIncrease: 0 },
      config,
    );
    const high = computeHeatScore(
      { articleCount: 20, sourceTierMin: 3, recentHourIncrease: 0 },
      config,
    );
    expect(high).toBeGreaterThan(low);
  });

  it('최근 1시간 증가분(속도)이 클수록 점수가 오른다', () => {
    const slow = computeHeatScore(
      { articleCount: 5, sourceTierMin: 1, recentHourIncrease: 0 },
      config,
    );
    const fast = computeHeatScore(
      { articleCount: 5, sourceTierMin: 1, recentHourIncrease: 3 },
      config,
    );
    expect(fast).toBeGreaterThan(slow);
  });

  it('sourceTierMin이 null이면 tierBonus 없이 계산한다', () => {
    expect(
      computeHeatScore({ articleCount: 1, sourceTierMin: null, recentHourIncrease: 0 }, config),
    ).toBe(0);
  });

  it('알려지지 않은 tier는 보너스 0으로 처리한다', () => {
    expect(
      computeHeatScore({ articleCount: 1, sourceTierMin: 99, recentHourIncrease: 0 }, config),
    ).toBe(0);
  });
});
