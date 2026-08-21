/**
 * T2.3.7 — supplyChain 계산 (docs/10-scoring.md §1: "결정론 (경로상 SUPPLY_CHAIN 엣지 weight)").
 * 경로에 SUPPLY_CHAIN 엣지가 있으면 그 weight를 0~100으로 스케일해 점수로 쓴다.
 * 여러 개면(드묾) 가장 약한 고리를 취한다 — confidence 계산과 같은 철학(§5).
 * 순수 함수, IO 없음 (R7).
 */
import type { EdgeKind, PathStep } from '@gukjang/spec';

export function computeSupplyChainScore(
  path: readonly PathStep[],
  edgeWeights: readonly number[],
): number {
  const supplyChainWeights: number[] = [];
  path.forEach((step, i) => {
    if (i === 0) return; // 첫 스텝은 엣지가 없다
    if ((step.edgeType as EdgeKind | undefined) === 'SUPPLY_CHAIN') {
      const weight = edgeWeights[i - 1];
      if (weight !== undefined) supplyChainWeights.push(weight);
    }
  });
  if (supplyChainWeights.length === 0) return 0;
  return Math.round(100 * Math.min(...supplyChainWeights));
}
