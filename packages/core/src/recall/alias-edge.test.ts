import { describe, expect, it } from 'vitest';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type { KeywordMatchConfig } from '../scoring/types';
import type { AliasRecallHit } from './types';
import { buildAliasCandidate, planAliasEdge } from './alias-edge';

const keywordMatchCfg = scoringConfig.keywordMatch as KeywordMatchConfig;

const EXACT_HIT: AliasRecallHit = {
  companyId: 1,
  companyName: '노루페인트',
  companyTicker: '090350',
  matchedAlias: '노루',
  aliasType: 'SHORT',
  isAmbiguous: false,
  recallRule: 'ALIAS_EXACT',
  recallScore: 1.0,
  isExactMatch: true,
};

const SIMILAR_HIT: AliasRecallHit = {
  companyId: 3,
  companyName: '원익IPS',
  companyTicker: '240810',
  matchedAlias: '원익IPS',
  aliasType: 'OFFICIAL',
  isAmbiguous: false,
  recallRule: 'ALIAS_PREFIX',
  recallScore: 0.55,
  isExactMatch: false,
};

describe('planAliasEdge', () => {
  it('ALIAS_EXACT → NAME_MATCH 엣지', () => {
    const plan = planAliasEdge(EXACT_HIT);
    expect(plan.edgeType).toBe('NAME_MATCH');
    expect(plan.weight).toBe(1.0);
    expect(plan.confidence).toBe(1.0);
  });

  it('비-exact → NAME_SIMILAR 엣지', () => {
    const plan = planAliasEdge(SIMILAR_HIT);
    expect(plan.edgeType).toBe('NAME_SIMILAR');
  });

  it('모호 별칭이면 confidence가 감점된다', () => {
    const plan = planAliasEdge({ ...EXACT_HIT, isAmbiguous: true });
    expect(plan.confidence).toBeLessThan(1.0);
    expect(plan.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe('buildAliasCandidate', () => {
  it('entity→company 2스텝 경로를 조립한다', () => {
    const plan = planAliasEdge(EXACT_HIT);
    const candidate = buildAliasCandidate(
      EXACT_HIT,
      7,
      { id: 501, kind: 'ENTITY', label: '노루' },
      { id: 601, kind: 'COMPANY', label: '노루페인트' },
      plan,
      keywordMatchCfg,
    );
    expect(candidate.path).toHaveLength(2);
    expect(candidate.path[0]?.nodeId).toBe(501);
    expect(candidate.path[1]?.nodeId).toBe(601);
    expect(candidate.hopCount).toBe(1);
    expect(candidate.evidence).toHaveLength(1);
    expect(candidate.companyId).toBe(1);
    expect(candidate.entityId).toBe(7);
    expect(candidate.pathEdgeConfidences).toEqual([plan.confidence]);
    expect(candidate.isAmbiguousAlias).toBe(false);
  });

  it('노루→노루페인트 exact 별칭: keywordMatchScore가 docs 예시(95)와 일치한다', () => {
    const plan = planAliasEdge(EXACT_HIT);
    const candidate = buildAliasCandidate(
      EXACT_HIT,
      7,
      { id: 501, kind: 'ENTITY', label: '노루' },
      { id: 601, kind: 'COMPANY', label: '노루페인트' },
      plan,
      keywordMatchCfg,
    );
    // EXACT_HIT.matchedAlias === '노루' (SHORT), entityName '노루' → exact, 100×0.95=95.
    expect(candidate.keywordMatchScore).toBe(95);
  });
});
