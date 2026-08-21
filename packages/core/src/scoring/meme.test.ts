import { describe, expect, it } from 'vitest';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type { MemeConfig } from './types';
import { computeMemeScore } from './meme';

const cfg = scoringConfig.meme as MemeConfig;

describe('computeMemeScore', () => {
  it('docs/10 §4 공식을 그대로 재현한다 (시세 있음)', () => {
    const score = computeMemeScore(
      { memeLlm: 85, businessRelevance: 10, marketReaction: 81, connectionType: 'NAME_MATCH' },
      cfg,
    );
    // 0.5*85 + 0.3*90 + 0.2*81 = 42.5+27+16.2 = 85.7 → 86
    expect(score).toBe(86);
  });

  it('type이 MEME이면 memeTypeFloor(50) 밑으로 내려가지 않는다', () => {
    const score = computeMemeScore(
      { memeLlm: 0, businessRelevance: 100, marketReaction: 0, connectionType: 'MEME' },
      cfg,
    );
    expect(score).toBe(cfg.memeTypeFloor);
  });

  it('MEME이 아니면 floor를 적용하지 않는다', () => {
    const score = computeMemeScore(
      { memeLlm: 0, businessRelevance: 100, marketReaction: 0, connectionType: 'DIRECT' },
      cfg,
    );
    expect(score).toBe(0);
  });

  it('시세가 없으면(null) 남은 두 가중치로 재정규화한다 — 0으로 넣지 않는다', () => {
    const withMarket = computeMemeScore(
      { memeLlm: 85, businessRelevance: 10, marketReaction: 0, connectionType: 'NAME_MATCH' },
      cfg,
    );
    const withoutMarket = computeMemeScore(
      { memeLlm: 85, businessRelevance: 10, marketReaction: null, connectionType: 'NAME_MATCH' },
      cfg,
    );
    // MR=0으로 그냥 넣으면 marketReactionWeight 몫만큼 낮게 나오지만, 재정규화하면
    // 나머지 두 항목만으로 계산되어 더 높게 나와야 한다(아침 뉴스 저평가 방지).
    expect(withoutMarket).toBeGreaterThan(withMarket);
  });
});
