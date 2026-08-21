/**
 * T2.3.7 — 스코어링 파라미터 타입. spec/scoring.config.json(버전 sc-v1)의 shape과 1:1 대응.
 * 값 자체는 코드에 하드코딩하지 않는다(CLAUDE.md §3) — 호출부가 JSON을 읽어 이 타입으로 넘긴다
 * (packages/core/src/news/heat-score.ts와 같은 패턴).
 */
import type { AliasKind, ConnectionKind } from '@gukjang/spec';

export interface ScoringProfile {
  appliesTo: readonly ConnectionKind[];
  weights: Record<string, number>;
}

export interface KeywordMatchConfig {
  exactAlias: number;
  aliasTypeMultiplier: Record<AliasKind, number>;
  jamoSimilarityFloor: number;
  firstSyllableBonus: number;
  ambiguousAliasPenalty: number;
  lengthPenalty: { minLen: number; penaltyUnderMinLen: number };
}

export interface MarketReactionConfig {
  volumeWeight: number;
  priceWeight: number;
  volumeLogBase: number;
  volumeCoef: number;
  volumeIntercept: number;
  priceCoef: number;
  priceIntercept: number;
  useAbsolutePriceChange: boolean;
  nullValue: number;
}

export interface MemeConfig {
  llmWeight: number;
  inverseBusinessWeight: number;
  marketReactionWeight: number;
  memeTypeFloor: number;
}

export interface ScoringConfig {
  version: string;
  profiles: { BUSINESS: ScoringProfile; NOMINAL: ScoringProfile };
  confidenceFactor: { base: number; span: number };
  hopDecay: { perHop: number; floor: number };
  caps: {
    noEvidenceEdge: number;
    unreviewedHighScore: number;
    ambiguousAlias: number;
    memeBusinessRelevance: number;
  };
  keywordMatch: KeywordMatchConfig;
  marketReaction: MarketReactionConfig;
  meme: MemeConfig;
  relevanceBand: { HIGH: number; MEDIUM: number; LOW: number };
}

/** docs/10-scoring.md §6 computeConnectionScore의 입력 6개 점수. */
export interface RawScores {
  businessRelevance: number;
  keywordMatch: number;
  supplyChain: number;
  marketReaction: number | null;
  meme: number;
  confidence: number;
}

export interface ConnectionScoreFlags {
  hasEvidenceGap: boolean;
  ambiguousAlias: boolean;
  reviewed: boolean;
}

/** spec/scoring.config.json의 reviewTriggers — docs/13-validation.md §4 관리자 검수 큐 트리거. */
export interface ReviewTriggersConfig {
  businessRelevanceAtLeast: number;
  connectionScoreAtLeast: number;
  memeScoreAtLeast: number;
  hopCountAtLeast: number;
  ambiguousAlias: boolean;
  counterCheckRefuted: boolean;
}
