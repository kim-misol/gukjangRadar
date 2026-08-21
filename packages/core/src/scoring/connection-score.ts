/**
 * T2.3.7 — connection_score 최종 산출 (docs/10-scoring.md §6, 참조 구현 §8).
 * profile(NOMINAL/BUSINESS) 가중합 → confidence/hop 감쇠 → 상한(cap) 적용까지
 * 문서의 참조 구현을 그대로 옮긴 것. 가중치·상한은 spec/scoring.config.json에서 읽어 넘긴다.
 * 순수 함수, IO 없음 (R7).
 */
import type { ConnectionKind } from '@gukjang/spec';
import type { ConnectionScoreFlags, RawScores, ScoringConfig } from './types';

export function computeConnectionScore(
  s: RawScores,
  type: ConnectionKind,
  hopCount: number,
  flags: ConnectionScoreFlags,
  cfg: ScoringConfig,
): number {
  const profile = cfg.profiles.NOMINAL.appliesTo.includes(type)
    ? cfg.profiles.NOMINAL
    : cfg.profiles.BUSINESS;

  // null 점수(시세 없음 등)는 제외하고 나머지 가중치로 재정규화한다.
  const entries = Object.entries(profile.weights).filter(
    ([k]) => s[k as keyof RawScores] !== null,
  ) as [keyof RawScores, number][];
  const wSum = entries.reduce((a, [, w]) => a + w, 0);
  const base = entries.reduce((a, [k, w]) => a + w * (s[k] as number), 0) / wSum;

  const confFac = cfg.confidenceFactor.base + cfg.confidenceFactor.span * (s.confidence / 100);
  const hopFac = Math.max(cfg.hopDecay.floor, 1 - cfg.hopDecay.perHop * (hopCount - 1));

  let out = Math.round(Math.min(100, Math.max(0, base * confFac * hopFac)));
  if (flags.hasEvidenceGap) out = Math.min(out, cfg.caps.noEvidenceEdge);
  if (flags.ambiguousAlias) out = Math.min(out, cfg.caps.ambiguousAlias);
  if (!flags.reviewed) out = Math.min(out, cfg.caps.unreviewedHighScore);
  return out;
}
