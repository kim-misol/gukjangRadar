import { describe, expect, it } from 'vitest';
import type { PathStep } from '@gukjang/spec';
import { computeSupplyChainScore } from './supply-chain';

const PATH_WITH_SUPPLY: PathStep[] = [
  { nodeId: 1, kind: 'ENTITY', label: 'AI 가속기' },
  { nodeId: 2, kind: 'CONCEPT', label: 'HBM', edgeLabel: '개념 사전 매칭' },
  {
    nodeId: 3,
    kind: 'COMPANY',
    label: 'SK하이닉스',
    edgeType: 'SUPPLY_CHAIN',
    edgeLabel: '공급망',
  },
];

describe('computeSupplyChainScore', () => {
  it('경로에 SUPPLY_CHAIN 엣지가 있으면 weight를 0~100으로 스케일한다', () => {
    const score = computeSupplyChainScore(PATH_WITH_SUPPLY, [1, 0.85]);
    expect(score).toBe(85);
  });

  it('SUPPLY_CHAIN 엣지가 없으면 0', () => {
    const path: PathStep[] = [
      { nodeId: 1, kind: 'ENTITY', label: '노루' },
      { nodeId: 2, kind: 'COMPANY', label: '노루페인트', edgeType: 'NAME_MATCH' },
    ];
    expect(computeSupplyChainScore(path, [0.95])).toBe(0);
  });

  it('경로가 비어있으면 0', () => {
    expect(computeSupplyChainScore([], [])).toBe(0);
  });
});
