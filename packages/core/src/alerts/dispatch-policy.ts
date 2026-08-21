/**
 * T3.3.4 — 알림 발송 판정 (docs/11-pipeline.md §2 ⑭, docs/05-screen-specs.md S7).
 * 순수 함수, IO 없음 (R7). 매칭 대상 텍스트 조회·일일 발송 카운트 집계·실제 발송은
 * apps/worker가 담당하고, 이 모듈은 "보낼지 말지"만 결정한다.
 */
import type { ConnectionKind } from '@gukjang/spec';
import { isMemeConnection } from '../scoring/meme';

export interface AlertMatchInput {
  keywordNorm: string;
  clusterHeadlineNorm: string;
  entityNameNorms: string[];
}

/** `alert_keyword.keyword_norm`이 클러스터 제목/개체에 매칭되는가 (docs/11 §2 ⑭). */
export function matchesAlertKeyword(input: AlertMatchInput): boolean {
  if (input.clusterHeadlineNorm.includes(input.keywordNorm)) return true;
  return input.entityNameNorms.some((name) => name.includes(input.keywordNorm));
}

/**
 * KST 22:00~07:00 무음 시간대인가.
 * UTC 인스턴트를 받아 KST(UTC+9)로 환산한다 — 서버 타임존에 의존하지 않기 위함.
 */
export function isQuietHoursKst(nowUtc: Date): boolean {
  const kstHour = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
  return kstHour >= 22 || kstHour < 7;
}

export type AlertDispatchReason =
  'BELOW_MIN_SCORE' | 'MEME_EXCLUDED' | 'DAILY_CAP_REACHED' | 'QUIET_HOURS';

export type AlertDispatchDecision =
  { dispatch: true } | { dispatch: false; reason: AlertDispatchReason };

export interface AlertDispatchInput {
  minScore: number;
  includeMeme: boolean;
  connectionType: ConnectionKind;
  connectionScore: number;
  memeScore: number;
  /** 오늘 이 키워드로 이미 발송한 횟수 (`alert_delivery` 집계) */
  dailyDeliveryCount: number;
  now: Date;
  /** 키워드당 일일 발송 상한 (기본 3, docs/05 S7) */
  dailyCap?: number;
}

/**
 * 매칭된 후보를 실제로 발송할지 결정한다.
 * 무음 시간대/일일 상한은 "거부"가 아니라 "보류"다 — `alert_delivery` insert를 하지 않으므로
 * 다음 배치(⑭ 큐 재실행)에서 조건이 바뀌면(무음 시간대 종료 등) 다시 후보로 올라온다.
 */
export function decideAlertDispatch(input: AlertDispatchInput): AlertDispatchDecision {
  if (input.connectionScore < input.minScore) {
    return { dispatch: false, reason: 'BELOW_MIN_SCORE' };
  }
  if (isMemeConnection(input.connectionType, input.memeScore) && !input.includeMeme) {
    return { dispatch: false, reason: 'MEME_EXCLUDED' };
  }
  if (input.dailyDeliveryCount >= (input.dailyCap ?? 3)) {
    return { dispatch: false, reason: 'DAILY_CAP_REACHED' };
  }
  if (isQuietHoursKst(input.now)) {
    return { dispatch: false, reason: 'QUIET_HOURS' };
  }
  return { dispatch: true };
}
