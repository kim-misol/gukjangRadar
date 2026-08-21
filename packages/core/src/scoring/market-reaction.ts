/**
 * T2.3.7 — marketReaction 계산 (docs/10-scoring.md §3).
 * vol = clamp(0,100, volumeCoef × log_base(max(volumeRatio20,0.25)) + volumeIntercept)
 * price = clamp(0,100, priceCoef × |changePct| + priceIntercept)
 * MR = round(volumeWeight×vol + priceWeight×price)
 *
 * 시세 자체가 없는 경우(장 시작 전·거래정지·신규상장)는 이 함수를 호출하지 않고 null을
 * 그대로 둔다 — 호출부(connection-score.ts)가 프로파일 가중치를 재정규화한다.
 * 순수 함수, IO 없음 (R7).
 */
import type { MarketReactionConfig } from './types';

export interface MarketReactionInput {
  volumeRatio20: number;
  changePct: number;
}

function clamp(min: number, max: number, v: number): number {
  return Math.min(max, Math.max(min, v));
}

export function computeMarketReactionScore(
  input: MarketReactionInput,
  cfg: MarketReactionConfig,
): number {
  const vol = clamp(
    0,
    100,
    cfg.volumeCoef * (Math.log(Math.max(input.volumeRatio20, 0.25)) / Math.log(cfg.volumeLogBase)) +
      cfg.volumeIntercept,
  );
  const changeForPrice = cfg.useAbsolutePriceChange ? Math.abs(input.changePct) : input.changePct;
  const price = clamp(0, 100, cfg.priceCoef * changeForPrice + cfg.priceIntercept);

  return Math.round(cfg.volumeWeight * vol + cfg.priceWeight * price);
}
