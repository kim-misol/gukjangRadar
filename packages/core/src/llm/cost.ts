/**
 * T2.2.1 — 토큰 사용량 → USD 비용 환산. 순수 함수, 외부 IO 없음 (R7).
 * 모델 단가는 자주 바뀌므로 호출부(worker)가 CostRates를 주입한다 — 여기 하드코딩하지 않는다.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostRates {
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
}

/** llm_run.cost_usd는 numeric(10,6)이므로 소수점 6자리로 반올림한다. */
export function computeCostUsd(usage: TokenUsage, rates: CostRates): number {
  const cost =
    (usage.inputTokens / 1_000_000) * rates.inputPerMTokUsd +
    (usage.outputTokens / 1_000_000) * rates.outputPerMTokUsd;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
