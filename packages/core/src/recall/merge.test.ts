import { describe, expect, it } from 'vitest';
import type { Candidate } from '@gukjang/spec';
import { mergeCandidates } from './merge';

function makeCandidate(
  companyId: number,
  recallScore: number,
  rule: Candidate['recallRule'],
): Candidate {
  return {
    companyId,
    ticker: String(companyId),
    name: `company-${companyId}`,
    entityId: 1,
    recallRule: rule,
    recallScore,
    path: [],
    hopCount: 1,
    evidence: [],
    keywordMatchScore: 0,
    isAmbiguousAlias: false,
    pathEdgeConfidences: [1],
    pathEdgeWeights: [1],
  };
}

describe('mergeCandidates', () => {
  it('같은 회사가 여러 룰로 발견되면 recallScore가 높은 쪽만 남긴다', () => {
    const viaAlias = makeCandidate(1, 0.55, 'ALIAS_PREFIX');
    const viaExact = makeCandidate(1, 1.0, 'ALIAS_EXACT');
    const merged = mergeCandidates([[viaAlias], [viaExact]], 40);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.recallRule).toBe('ALIAS_EXACT');
  });

  it('recallScore 내림차순으로 정렬한다', () => {
    const low = makeCandidate(1, 0.3, 'THEME_DICT');
    const high = makeCandidate(2, 0.9, 'ALIAS_EXACT');
    const merged = mergeCandidates([[low, high]], 40);
    expect(merged.map((c) => c.companyId)).toEqual([2, 1]);
  });

  it('상한을 초과하면 recallScore 기준으로 절단한다', () => {
    const list = Array.from({ length: 50 }, (_, i) => makeCandidate(i, i / 50, 'THEME_DICT'));
    const merged = mergeCandidates([list], 40);
    expect(merged).toHaveLength(40);
    expect(merged[0]?.companyId).toBe(49); // 가장 높은 점수
  });
});
