import { describe, expect, it } from 'vitest';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type { ScoringConfig } from './types';
import { computeConnectionScore } from './connection-score';

const cfg = scoringConfig as unknown as ScoringConfig;

describe('computeConnectionScore', () => {
  // docs/10-scoring.md §9 "계산 예시 (골든셋 #1 노루페인트)"를 그대로 재현한다.
  it('골든셋 #1 노루페인트 예시: 71점', () => {
    const score = computeConnectionScore(
      {
        businessRelevance: 10,
        keywordMatch: 95,
        supplyChain: 0,
        marketReaction: 81,
        meme: 87,
        confidence: 90,
      },
      'NAME_MATCH',
      2,
      { hasEvidenceGap: false, ambiguousAlias: false, reviewed: false },
      cfg,
    );
    expect(score).toBe(71);
  });

  it('시세가 없으면(null) 나머지 가중치로 재정규화한다', () => {
    const score = computeConnectionScore(
      {
        businessRelevance: 85,
        keywordMatch: 0,
        supplyChain: 80,
        marketReaction: null,
        meme: 0,
        confidence: 88,
      },
      'SUPPLY_CHAIN',
      2,
      { hasEvidenceGap: false, ambiguousAlias: false, reviewed: false },
      cfg,
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('evidence 없는 엣지가 있으면 60점 상한', () => {
    const score = computeConnectionScore(
      {
        businessRelevance: 95,
        keywordMatch: 95,
        supplyChain: 95,
        marketReaction: 95,
        meme: 0,
        confidence: 100,
      },
      'DIRECT',
      1,
      { hasEvidenceGap: true, ambiguousAlias: false, reviewed: true },
      cfg,
    );
    expect(score).toBeLessThanOrEqual(cfg.caps.noEvidenceEdge);
  });

  it('모호 별칭이면 80점 상한', () => {
    const score = computeConnectionScore(
      {
        businessRelevance: 95,
        keywordMatch: 95,
        supplyChain: 0,
        marketReaction: 95,
        meme: 95,
        confidence: 100,
      },
      'NAME_MATCH',
      1,
      { hasEvidenceGap: false, ambiguousAlias: true, reviewed: true },
      cfg,
    );
    expect(score).toBeLessThanOrEqual(cfg.caps.ambiguousAlias);
  });

  it('미검수 상태면 95점 상한', () => {
    const score = computeConnectionScore(
      {
        businessRelevance: 100,
        keywordMatch: 100,
        supplyChain: 100,
        marketReaction: 100,
        meme: 0,
        confidence: 100,
      },
      'DIRECT',
      1,
      { hasEvidenceGap: false, ambiguousAlias: false, reviewed: false },
      cfg,
    );
    expect(score).toBeLessThanOrEqual(cfg.caps.unreviewedHighScore);
  });

  it('hop이 늘어날수록 감쇠하지만 floor 밑으로는 내려가지 않는다', () => {
    const s = {
      businessRelevance: 90,
      keywordMatch: 0,
      supplyChain: 90,
      marketReaction: 90,
      meme: 0,
      confidence: 100,
    };
    const hop1 = computeConnectionScore(
      s,
      'SUPPLY_CHAIN',
      1,
      { hasEvidenceGap: false, ambiguousAlias: false, reviewed: true },
      cfg,
    );
    const hop5 = computeConnectionScore(
      s,
      'SUPPLY_CHAIN',
      5,
      { hasEvidenceGap: false, ambiguousAlias: false, reviewed: true },
      cfg,
    );
    expect(hop5).toBeLessThan(hop1);
    expect(hop5).toBeGreaterThanOrEqual(Math.round(hop1 * cfg.hopDecay.floor - 1));
  });

  it('NOMINAL 프로파일(NAME_MATCH/KEYWORD/MEME)과 BUSINESS 프로파일은 서로 다른 가중치를 쓴다', () => {
    const s = {
      businessRelevance: 10,
      keywordMatch: 95,
      supplyChain: 0,
      marketReaction: 50,
      meme: 50,
      confidence: 90,
    };
    const nominal = computeConnectionScore(
      s,
      'NAME_MATCH',
      1,
      { hasEvidenceGap: false, ambiguousAlias: false, reviewed: true },
      cfg,
    );
    const business = computeConnectionScore(
      s,
      'DIRECT',
      1,
      { hasEvidenceGap: false, ambiguousAlias: false, reviewed: true },
      cfg,
    );
    // BR=10인데 BUSINESS 프로파일(BR 40%)을 쓰면 점수가 훨씬 낮게 눌린다 — docs §6 "왜 프로파일을 나눴나".
    expect(nominal).toBeGreaterThan(business);
  });
});
