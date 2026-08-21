/**
 * T4.2 — 관리자 검수 큐 (docs/13-validation.md §4). DB 통합 동작은 유닛테스트 대상이 아니다
 * (lib/api/queries.ts 상단 원칙과 동일).
 */
import { and, desc, eq, gte } from 'drizzle-orm';
import { schema, type getDb } from '@gukjang/db';
import type { ConnectionDto, ConnectionState } from '@gukjang/spec';
import { toConnectionDto, type ConnectionRow } from './mappers';

type Db = ReturnType<typeof getDb>;

export interface ReviewQueueParams {
  minScore: number;
  /** true(기본) — PENDING(리뷰 트리거에 걸린 것)만. false — 상태 무관 최근 50건(일일 육안 검수용). */
  onlyFlagged: boolean;
}

/** docs/13 §4 "관리자 검수 큐" 목록 조회. */
export async function listReviewQueue(db: Db, params: ReviewQueueParams): Promise<ConnectionDto[]> {
  const scoreFilter = gte(schema.connection.connectionScore, params.minScore);
  const where = params.onlyFlagged
    ? and(eq(schema.connection.status, 'PENDING'), scoreFilter)
    : scoreFilter;

  const rows = await db
    .select({
      id: schema.connection.id,
      clusterId: schema.connection.clusterId,
      connectionType: schema.connection.connectionType,
      businessRelevanceScore: schema.connection.businessRelevanceScore,
      keywordMatchScore: schema.connection.keywordMatchScore,
      supplyChainScore: schema.connection.supplyChainScore,
      marketReactionScore: schema.connection.marketReactionScore,
      memeScore: schema.connection.memeScore,
      confidenceScore: schema.connection.confidenceScore,
      connectionScore: schema.connection.connectionScore,
      relevanceBand: schema.connection.relevanceBand,
      path: schema.connection.path,
      hopCount: schema.connection.hopCount,
      explanation: schema.connection.explanation,
      caution: schema.connection.caution,
      counterEvidence: schema.connection.counterEvidence,
      dataSources: schema.connection.dataSources,
      status: schema.connection.status,
      companyId: schema.company.id,
      companyTicker: schema.company.ticker,
      companyName: schema.company.name,
      companyMarket: schema.company.market,
      companySector: schema.company.sector,
    })
    .from(schema.connection)
    .innerJoin(schema.company, eq(schema.company.id, schema.connection.companyId))
    .where(where)
    .orderBy(desc(schema.connection.createdAt))
    .limit(50);

  return rows.map((r) =>
    toConnectionDto({
      id: r.id,
      clusterId: r.clusterId,
      connectionType: r.connectionType,
      businessRelevanceScore: r.businessRelevanceScore,
      keywordMatchScore: r.keywordMatchScore,
      supplyChainScore: r.supplyChainScore,
      marketReactionScore: r.marketReactionScore,
      memeScore: r.memeScore,
      confidenceScore: r.confidenceScore,
      connectionScore: r.connectionScore,
      relevanceBand: r.relevanceBand,
      path: r.path,
      hopCount: r.hopCount,
      explanation: r.explanation,
      caution: r.caution,
      counterEvidence: r.counterEvidence,
      dataSources: r.dataSources,
      status: r.status,
      company: {
        id: r.companyId,
        ticker: r.companyTicker,
        name: r.companyName,
        market: r.companyMarket,
        sector: r.companySector,
      },
      market: null,
    } satisfies ConnectionRow),
  );
}

export type ReviewAction = 'APPROVE' | 'REJECT' | 'CORRECT';

export interface SubmitReviewInput {
  action: ReviewAction;
  reason?: string;
  /** CORRECT일 때만 사용 — 연결을 다른 회사로 옮기지는 않고 설명/사업연관성만 정정한다. */
  patch?: { businessRelevance?: number; explanation?: string };
}

const ACTION_TO_STATUS: Record<ReviewAction, ConnectionState> = {
  APPROVE: 'ACTIVE',
  REJECT: 'REJECTED',
  CORRECT: 'CORRECTED',
};

/**
 * docs/13 §4 액션 — APPROVE/REJECT/CORRECT. `connection_review`에 감사로그를 남기고
 * `connection.status`(+CORRECT면 patch 필드)를 갱신한다.
 * 알려진 단순화: docs/10 §8 "미검수 연결은 connection_score 상한 95" 해제(재계산)는 하지
 * 않는다 — `computeConnectionScore`에 필요한 hasEvidenceGap/ambiguousAlias 플래그가
 * connection 테이블에 저장돼 있지 않아, 저장 안 된 값을 추정해 재계산하면 오히려 부정확해질
 * 수 있다고 판단했다(docs/15 W8 진행 기록에 명시).
 */
export async function submitConnectionReview(
  db: Db,
  connectionId: number,
  reviewer: string,
  input: SubmitReviewInput,
): Promise<void> {
  await db.insert(schema.connectionReview).values({
    connectionId,
    reviewer,
    action: input.action,
    reason: input.reason ?? null,
    patch: input.patch ?? null,
  });

  const patchSet: Record<string, unknown> = {
    status: ACTION_TO_STATUS[input.action],
    updatedAt: new Date(),
  };
  if (input.action === 'CORRECT' && input.patch) {
    if (typeof input.patch.businessRelevance === 'number') {
      patchSet.businessRelevanceScore = input.patch.businessRelevance;
    }
    if (typeof input.patch.explanation === 'string') {
      patchSet.explanation = input.patch.explanation;
    }
  }

  await db.update(schema.connection).set(patchSet).where(eq(schema.connection.id, connectionId));
}
