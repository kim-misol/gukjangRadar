import type { FeedbackKind } from '@gukjang/spec';
import { schema, type getDb } from '@gukjang/db';

type Db = ReturnType<typeof getDb>;

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

  return rows.length > 0 ? 'CREATED' : 'ALREADY_SUBMITTED';
}
