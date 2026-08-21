import { describe, expect, it } from 'vitest';
import { computeCostUsd } from './cost';

describe('computeCostUsd', () => {
  it('입력·출력 토큰을 각각의 단가로 환산해 더한다', () => {
    const cost = computeCostUsd(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      { inputPerMTokUsd: 1, outputPerMTokUsd: 5 },
    );
    expect(cost).toBe(6);
  });

  it('토큰이 0이면 비용도 0', () => {
    expect(
      computeCostUsd(
        { inputTokens: 0, outputTokens: 0 },
        { inputPerMTokUsd: 1, outputPerMTokUsd: 5 },
      ),
    ).toBe(0);
  });

  it('소수점 6자리로 반올림한다 (numeric(10,6))', () => {
    const cost = computeCostUsd(
      { inputTokens: 333, outputTokens: 0 },
      { inputPerMTokUsd: 1, outputPerMTokUsd: 5 },
    );
    expect(cost).toBe(0.000333);
  });

  it('소액 실제 사례(하이쿠급 단가)를 재현한다', () => {
    const cost = computeCostUsd(
      { inputTokens: 1500, outputTokens: 300 },
      { inputPerMTokUsd: 1, outputPerMTokUsd: 5 },
    );
    expect(cost).toBeCloseTo(0.0015 + 0.0015, 6);
  });
});
