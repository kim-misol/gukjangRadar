/**
 * T2.2.1 — 모델별 단가(USD/1M 토큰). computeCostUsd(packages/core)에 넘길 CostRates를
 * 여기서 조회한다. 단가는 자주 바뀌므로 알려지지 않은 모델은 조용히 0으로 두지 않고
 * 에러를 던진다 — 비용을 실제보다 적게 기록하는 게 더 위험하다.
 */
import type { CostRates } from '@gukjang/core';

const MODEL_RATES: Record<string, CostRates> = {
  'claude-haiku-4-5': { inputPerMTokUsd: 1, outputPerMTokUsd: 5 },
  'claude-sonnet-5': { inputPerMTokUsd: 3, outputPerMTokUsd: 15 },
  'claude-opus-5': { inputPerMTokUsd: 5, outputPerMTokUsd: 25 },
};

export function getModelRates(model: string): CostRates {
  const rates = MODEL_RATES[model];
  if (!rates) {
    throw new Error(`알 수 없는 모델의 단가 — model-pricing.ts에 추가할 것: ${model}`);
  }
  return rates;
}
