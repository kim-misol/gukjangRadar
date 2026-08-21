import { describe, expect, it } from 'vitest';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import { computeRelevanceBand } from './relevance-band';

const cfg = scoringConfig.relevanceBand;

describe('computeRelevanceBand', () => {
  it('노루페인트 예시(BR=10) → NONE', () => {
    expect(computeRelevanceBand(10, cfg)).toBe('NONE');
  });
  it('경계값: HIGH(70) 이상', () => {
    expect(computeRelevanceBand(70, cfg)).toBe('HIGH');
    expect(computeRelevanceBand(69, cfg)).toBe('MEDIUM');
  });
  it('경계값: MEDIUM(40) 이상', () => {
    expect(computeRelevanceBand(40, cfg)).toBe('MEDIUM');
    expect(computeRelevanceBand(39, cfg)).toBe('LOW');
  });
  it('경계값: LOW(15) 이상', () => {
    expect(computeRelevanceBand(15, cfg)).toBe('LOW');
    expect(computeRelevanceBand(14, cfg)).toBe('NONE');
  });
  it('0은 NONE', () => {
    expect(computeRelevanceBand(0, cfg)).toBe('NONE');
  });
});
