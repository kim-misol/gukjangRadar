import { describe, expect, it } from 'vitest';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type { KeywordMatchConfig } from './types';
import { computeKeywordMatchScore } from './keyword-match';

const cfg = scoringConfig.keywordMatch as KeywordMatchConfig;

describe('computeKeywordMatchScore', () => {
  // docs/10-scoring.md §2: "원희 → 원익: sim 0.57 → 유사도 미달이나 첫 음절 동일로 후보 진입,
  // KM = round(57)+12 = 69, 별칭 OFFICIAL ×1.0 → 69."
  it('원희 → 원익: 자모 유사 + 첫음절 보너스 = 69', () => {
    const score = computeKeywordMatchScore(
      {
        hasNameEdge: true,
        isExactMatch: false,
        entityName: '원희',
        aliasText: '원익',
        aliasType: 'OFFICIAL',
        isAmbiguous: false,
      },
      cfg,
    );
    expect(score).toBe(69);
  });

  // docs/10 §2: "노루 → 노루페인트: SHORT 별칭 완전 일치 → 100 × 0.95 = 95."
  it('노루 → 노루페인트: exact SHORT 별칭 = 95 (첫음절 보너스 미적용)', () => {
    const score = computeKeywordMatchScore(
      {
        hasNameEdge: true,
        isExactMatch: true,
        entityName: '노루',
        aliasText: '노루',
        aliasType: 'SHORT',
        isAmbiguous: false,
      },
      cfg,
    );
    expect(score).toBe(95);
  });

  it('이름 관련 엣지가 없으면 0 (순수 SUPPLY_CHAIN 후보 등)', () => {
    const score = computeKeywordMatchScore(
      {
        hasNameEdge: false,
        isExactMatch: false,
        entityName: 'AI 가속기',
        aliasText: '',
        aliasType: 'OFFICIAL',
        isAmbiguous: false,
      },
      cfg,
    );
    expect(score).toBe(0);
  });

  it('모호 별칭이면 25점 감점', () => {
    const withPenalty = computeKeywordMatchScore(
      {
        hasNameEdge: true,
        isExactMatch: true,
        entityName: '한샘',
        aliasText: '한샘',
        aliasType: 'OFFICIAL',
        isAmbiguous: true,
      },
      cfg,
    );
    expect(withPenalty).toBe(100 - 25);
  });

  it('개체 길이 1자면 40점 감점', () => {
    const score = computeKeywordMatchScore(
      {
        hasNameEdge: true,
        isExactMatch: true,
        entityName: '달',
        aliasText: '달',
        aliasType: 'OFFICIAL',
        isAmbiguous: false,
      },
      cfg,
    );
    expect(score).toBe(100 - 40);
  });

  it('감점이 누적되어도 0 밑으로 내려가지 않는다', () => {
    const score = computeKeywordMatchScore(
      {
        hasNameEdge: true,
        isExactMatch: false,
        entityName: '가',
        aliasText: '나',
        aliasType: 'NICKNAME',
        isAmbiguous: true,
      },
      cfg,
    );
    expect(score).toBe(0);
  });
});
