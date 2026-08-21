import { describe, expect, it } from 'vitest';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type { MarketReactionConfig } from './types';
import { computeMarketReactionScore } from './market-reaction';

const cfg = scoringConfig.marketReaction as MarketReactionConfig;

describe('computeMarketReactionScore', () => {
  // docs/10 §3: "거래량 20일 평균의 4배 → vol=100. 평균 수준 → 50."
  it('거래량 평균 수준(ratio=1)·등락 0% → 50점 부근', () => {
    const score = computeMarketReactionScore({ volumeRatio20: 1, changePct: 0 }, cfg);
    // vol = 25*log2(1)+50 = 50, price = 2.5*0+50 = 50 → MR = round(0.6*50+0.4*50) = 50
    expect(score).toBe(50);
  });

  it('거래량 20일 평균의 4배 → 거래량 축 최대(100)', () => {
    const score = computeMarketReactionScore({ volumeRatio20: 4, changePct: 0 }, cfg);
    // vol = 25*log2(4)+50 = 25*2+50 = 100
    expect(score).toBe(Math.round(0.6 * 100 + 0.4 * 50));
  });

  it('등락률은 절댓값을 쓴다 — 급락도 상승과 동일하게 반응', () => {
    const up = computeMarketReactionScore({ volumeRatio20: 1, changePct: 10 }, cfg);
    const down = computeMarketReactionScore({ volumeRatio20: 1, changePct: -10 }, cfg);
    expect(up).toBe(down);
  });

  it('극단값이어도 0~100을 벗어나지 않는다', () => {
    const score = computeMarketReactionScore({ volumeRatio20: 50, changePct: 30 }, cfg);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
