import { eq, sql } from 'drizzle-orm';
import type { ConnectionState, FeedbackKind } from '@gukjang/spec';
import { decideFeedbackPromotion, type FeedbackPromotionConfig } from '@gukjang/core';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import { schema, type getDb } from '@gukjang/db';

type Db = ReturnType<typeof getDb>;

const FEEDBACK_PROMOTION_CONFIG = scoringConfig.feedbackPromotion as FeedbackPromotionConfig;

export type SubmitFeedbackResult = 'CREATED' | 'ALREADY_SUBMITTED';

/**
 * POST /v1/connections/{connectionId}/feedback — spec/openapi.yaml.
 * docs/07-api-spec.md §4 "피드백 연결당 1회 (DB unique 제약으로 강제)" —
 * `connection_feedback_conn_anon_uq`가 실제 강제 지점이라 애플리케이션에서 다시 조회하지 않고
 * insert 결과(행이 실제로 생겼는지)로만 판단한다.
 */
export async function submitConnectionFeedback(
  db: Db,
  connectionId: number,
  kind: FeedbackKind,
  anonId: string,
): Promise<SubmitFeedbackResult> {
  const rows = await db
    .insert(schema.connectionFeedback)
    .values({ connectionId, kind, anonId })
    .onConflictDoNothing({
      target: [schema.connectionFeedback.connectionId, schema.connectionFeedback.anonId],
    })
    .returning({ id: schema.connectionFeedback.id });

  if (rows.length > 0) {
    await applyFeedbackPromotion(db, connectionId);
  }

  return rows.length > 0 ? 'CREATED' : 'ALREADY_SUBMITTED';
}

const PROMOTION_REASON: Record<'PENDING' | 'DISPUTED', string> = {
  PENDING: `사용자 피드백(WRONG) ${FEEDBACK_PROMOTION_CONFIG.wrongCountAtLeast}건 이상 — 자동 노출 중단`,
  DISPUTED: `사용자 피드백(FARFETCHED) 비율 ${Math.round(FEEDBACK_PROMOTION_CONFIG.farfetchedRatioAtLeast * 100)}% 초과(표본 ${FEEDBACK_PROMOTION_CONFIG.minSample}건 이상) — 자동 검수 승격`,
};

/**
 * T4.5 — docs/13-validation.md §4 "사용자 피드백" 자동 승격. 새 피드백이 저장될 때마다
 * 그 연결의 kind별 누적 카운트를 다시 집계해 `decideFeedbackPromotion`(packages/core, 순수
 * 함수)에 판정을 맡기고, 상태가 바뀌어야 하는 경우에만 UPDATE + 감사로그(`connection_review`,
 * 기존 관리자 검수와 같은 테이블 재사용)를 남긴다.
 */
export async function applyFeedbackPromotion(db: Db, connectionId: number): Promise<void> {
  const [connectionRow] = await db
    .select({ status: schema.connection.status })
    .from(schema.connection)
    .where(eq(schema.connection.id, connectionId));
  if (!connectionRow) return;

  const counts = await db
    .select({ kind: schema.connectionFeedback.kind, count: sql<number>`count(*)::int` })
    .from(schema.connectionFeedback)
    .where(eq(schema.connectionFeedback.connectionId, connectionId))
    .groupBy(schema.connectionFeedback.kind);

  const countsByKind = { UNDERSTOOD: 0, FARFETCHED: 0, WRONG: 0 };
  for (const row of counts) {
    countsByKind[row.kind] = row.count;
  }

  const nextStatus = decideFeedbackPromotion(
    countsByKind,
    connectionRow.status as ConnectionState,
    FEEDBACK_PROMOTION_CONFIG,
  );
  if (nextStatus === null) return;

  await db.transaction(async (tx) => {
    await tx
      .update(schema.connection)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(schema.connection.id, connectionId));
    await tx.insert(schema.connectionReview).values({
      connectionId,
      reviewer: 'system:feedback-promotion',
      action: `AUTO_${nextStatus}`,
      reason: PROMOTION_REASON[nextStatus],
    });
  });
}
