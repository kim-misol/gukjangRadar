/**
 * T2.3.7 — meme 계산 (docs/10-scoring.md §4).
 * ME = clamp(0,100, 0.5×meme_llm + 0.3×(100−businessRelevance) + 0.2×MR)
 * connection_type이 MEME이면 최소 memeTypeFloor(기본 50)를 보장한다.
 *
 * marketReaction이 null(시세 없음)이면 marketReactionWeight를 나머지 두 가중치로
 * 재정규화한다 — scoring.config.json의 "0으로 넣으면 아침 뉴스가 저평가된다" 원칙을
 * meme 계산에도 동일하게 적용(docs/10 §3 노트, connectionScore와 같은 철학).
 * 순수 함수, IO 없음 (R7).
 */
import type { ConnectionKind } from '@gukjang/spec';
import type { MemeConfig } from './types';

export interface MemeScoreInput {
  memeLlm: number;
  businessRelevance: number;
  marketReaction: number | null;
  connectionType: ConnectionKind;
}

export function computeMemeScore(input: MemeScoreInput, cfg: MemeConfig): number {
  const inverseBusiness = 100 - input.businessRelevance;

  let raw: number;
  if (input.marketReaction === null) {
    const wSum = cfg.llmWeight + cfg.inverseBusinessWeight;
    raw = (cfg.llmWeight * input.memeLlm + cfg.inverseBusinessWeight * inverseBusiness) / wSum;
  } else {
    raw =
      cfg.llmWeight * input.memeLlm +
      cfg.inverseBusinessWeight * inverseBusiness +
      cfg.marketReactionWeight * input.marketReaction;
  }

  let score = Math.min(100, Math.max(0, raw));
  if (input.connectionType === 'MEME') {
    score = Math.max(score, cfg.memeTypeFloor);
  }
  return Math.round(score);
}

/** 억지 관련주 정의 — CLAUDE.md §6 "connection_type = MEME 이거나 meme_score ≥ 70". */
export function isMemeConnection(type: ConnectionKind, memeScore: number): boolean {
  return type === 'MEME' || memeScore >= 70;
}
