import { describe, expect, it } from 'vitest';
import { computeConfidenceScore } from './confidence';

describe('computeConfidenceScore', () => {
  // docs/10-scoring.md §9: "CF=90(=0.95×0.95)" — 경로 최소 엣지 confidence 0.95, llm_confidence 95.
  it('docs §9 예시: 0.95 × 0.95 → 90', () => {
    expect(computeConfidenceScore([0.95, 0.99], 95)).toBe(90);
  });

  it('경로에서 가장 약한 고리(최소 confidence)가 결정한다', () => {
    expect(computeConfidenceScore([0.9, 0.3, 0.95], 100)).toBe(30);
  });

  it('단일 엣지 경로', () => {
    expect(computeConfidenceScore([1], 80)).toBe(80);
  });
});
