/**
 * T2.3.8 — 저장 시 status(ACTIVE/PENDING) 결정. docs/13-validation.md §4:
 * reviewTriggers에 걸리면 관리자 검수 큐로 보내고(PENDING), 아니면 바로 노출한다(ACTIVE).
 * G3(금지어) 위반으로 forcedPending이 걸린 경우도 동일하게 PENDING.
 * 순수 함수, IO 없음 (R7).
 */
import type { ConnectionState } from '@gukjang/spec';
import type { ReviewTriggersConfig } from './types';

export interface ConnectionStatusInput {
  businessRelevance: number;
  connectionScore: number;
  memeScore: number;
  hopCount: number;
  isAmbiguousAlias: boolean;
  forcedPending: boolean;
}

export function decideConnectionStatus(
  input: ConnectionStatusInput,
  cfg: ReviewTriggersConfig,
): ConnectionState {
  const reviewTriggered =
    input.businessRelevance >= cfg.businessRelevanceAtLeast ||
    input.connectionScore >= cfg.connectionScoreAtLeast ||
    input.memeScore >= cfg.memeScoreAtLeast ||
    input.hopCount >= cfg.hopCountAtLeast ||
    (cfg.ambiguousAlias && input.isAmbiguousAlias);
  return input.forcedPending || reviewTriggered ? 'PENDING' : 'ACTIVE';
}
