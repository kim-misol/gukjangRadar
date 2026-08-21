/**
 * T2.3.7 — relevanceBand 산출 (docs/10-scoring.md §7).
 * businessRelevance 기준: ≥HIGH 'HIGH' / ≥MEDIUM 'MEDIUM' / ≥LOW 'LOW' / 그 외 'NONE'.
 * 순수 함수, IO 없음 (R7).
 */
import type { RelevanceBand } from '@gukjang/spec';

export function computeRelevanceBand(
  businessRelevance: number,
  cfg: { HIGH: number; MEDIUM: number; LOW: number },
): RelevanceBand {
  if (businessRelevance >= cfg.HIGH) return 'HIGH';
  if (businessRelevance >= cfg.MEDIUM) return 'MEDIUM';
  if (businessRelevance >= cfg.LOW) return 'LOW';
  return 'NONE';
}
