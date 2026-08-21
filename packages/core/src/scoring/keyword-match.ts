/**
 * T2.3.7 — keywordMatch 계산 (docs/10-scoring.md §2).
 * exact alias → 100×multiplier / 자모 유사(비-exact) → round(100×sim)×multiplier(+첫음절 보너스)
 * → 모호별칭 감점 → 1자 개체 감점 → 0~100 클램프.
 * 순수 함수, IO 없음 (R7).
 */
import type { AliasKind } from '@gukjang/spec';
import { jamoSimilarity, sharesFirstSyllable } from '../normalize/similarity';
import type { KeywordMatchConfig } from './types';

export interface KeywordMatchInput {
  /** 경로에 이름 관련 엣지(별칭 매칭)가 전혀 없는 후보(예: 순수 SUPPLY_CHAIN 후보)면 false. */
  hasNameEdge: boolean;
  /** alias_norm이 entity name_norm과 완전히 일치하는가 (ALIAS_EXACT). */
  isExactMatch: boolean;
  entityName: string;
  aliasText: string;
  aliasType: AliasKind;
  isAmbiguous: boolean;
}

export function computeKeywordMatchScore(
  input: KeywordMatchInput,
  cfg: KeywordMatchConfig,
): number {
  if (!input.hasNameEdge) return 0;

  const multiplier = cfg.aliasTypeMultiplier[input.aliasType];
  let score: number;
  if (input.isExactMatch) {
    score = cfg.exactAlias * multiplier;
  } else {
    const sim = jamoSimilarity(input.entityName, input.aliasText);
    score = Math.round(100 * sim) * multiplier;
    if (sharesFirstSyllable(input.entityName, input.aliasText)) {
      score += cfg.firstSyllableBonus;
    }
  }

  if (input.isAmbiguous) score -= cfg.ambiguousAliasPenalty;
  if (input.entityName.length < cfg.lengthPenalty.minLen) {
    score -= cfg.lengthPenalty.penaltyUnderMinLen;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}
