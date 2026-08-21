/**
 * T4.5 — 사용자 피드백 → 자동 상태 승격 (docs/13-validation.md §4, EPIC 4).
 * 순수 함수, IO 없음 (R7). 집계(연결별 kind 카운트)와 실제 UPDATE는 apps/web이 담당한다.
 */
import type { ConnectionState } from '@gukjang/spec';

export interface FeedbackCounts {
  UNDERSTOOD: number;
  FARFETCHED: number;
  WRONG: number;
}

/** spec/scoring.config.json의 feedbackPromotion 섹션 shape. */
export interface FeedbackPromotionConfig {
  farfetchedRatioAtLeast: number;
  minSample: number;
  wrongCountAtLeast: number;
}

/**
 * docs/13 §4: "WRONG 신고 3건 → 즉시 노출 중단"(PENDING, VISIBLE_STATUSES에서 제외됨),
 * "FARFETCHED 비율 40% 초과 && 표본 20 이상 → 자동 DISPUTED"(여전히 노출되지만 검수 큐 승격).
 * 관리자가 이미 REJECTED/CORRECTED로 확정한 연결은 피드백으로 덮어쓰지 않는다.
 * 현재 상태와 같은 값을 반환할 이유가 없으면 null(변화 없음)을 돌려준다.
 */
export type FeedbackPromotionResult = Extract<ConnectionState, 'PENDING' | 'DISPUTED'>;

export function decideFeedbackPromotion(
  counts: FeedbackCounts,
  currentStatus: ConnectionState,
  cfg: FeedbackPromotionConfig,
): FeedbackPromotionResult | null {
  if (currentStatus === 'REJECTED' || currentStatus === 'CORRECTED') return null;

  if (counts.WRONG >= cfg.wrongCountAtLeast) {
    return currentStatus === 'PENDING' ? null : 'PENDING';
  }

  const total = counts.UNDERSTOOD + counts.FARFETCHED + counts.WRONG;
  if (total >= cfg.minSample) {
    const ratio = counts.FARFETCHED / total;
    if (ratio > cfg.farfetchedRatioAtLeast) {
      return currentStatus === 'DISPUTED' ? null : 'DISPUTED';
    }
  }

  return null;
}
