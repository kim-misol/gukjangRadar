/**
 * T4.2 — 관리자 검수 큐 (docs/13-validation.md §4). DB 통합 동작은 유닛테스트 대상이 아니다
 * (lib/api/queries.ts 상단 원칙과 동일).
 */
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { schema, type getDb } from '@gukjang/db';
import type { ConnectionDto, ConnectionState } from '@gukjang/spec';
import { computeConnectionScore, computeRelevanceBand, type ScoringConfig } from '@gukjang/core';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import { toConnectionDto, type ConnectionRow } from './mappers';

type Db = ReturnType<typeof getDb>;

/** 리뷰 트리거(PENDING) + 피드백 자동승격(DISPUTED, T4.5)이 걸린 상태 — docs/13 §4. */
const FLAGGED_STATUSES: ConnectionState[] = ['PENDING', 'DISPUTED'];

export interface ReviewQueueParams {
  minScore: number;
  /** true(기본) — PENDING/DISPUTED(리뷰 트리거·피드백 자동승격)만. false — 상태 무관 최근 50건(일일 육안 검수용). */
  onlyFlagged: boolean;
}

/** docs/13 §4 "관리자 검수 큐" 목록 조회. */
export async function listReviewQueue(db: Db, params: ReviewQueueParams): Promise<ConnectionDto[]> {
  const scoreFilter = gte(schema.connection.connectionScore, params.minScore);
  const where = params.onlyFlagged
    ? and(inArray(schema.connection.status, FLAGGED_STATUSES), scoreFilter)
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
 *
 * docs/10 §8 "미검수 연결은 connection_score 상한 95" 해제 — APPROVE/CORRECT는 사람의 검수가
 * 끝났다는 뜻이므로 `reviewed:true`로 connectionScore를 다시 계산해 상한을 푼다.
 * `hasEvidenceGap`/`isAmbiguousAlias`는 build-connections.ts가 최초 판정 시점에 저장해 둔
 * 값을 그대로 재사용한다(2026-08-21 시세 재점수화 배치 작업 때 추가된 컬럼 — 예전엔 이 값이
 * 없어 재계산 자체를 미뤄뒀었다). CORRECT로 businessRelevance가 바뀌면 relevanceBand도
 * 함께 재계산한다(패치만 반영되고 band는 그대로인 불일치를 막기 위함).
 * `marketReactionScore`는 저장값이 정확히 0이면 "아직 재점수화 안 됨"(build 시점 기본값)으로
 * 보고 null 취급한다 — 실제 계산식(volumeIntercept/priceIntercept 기본 50 기준)은 시세가
 * 있으면 사실상 0이 나오지 않으므로 이 구분이 안전하다.
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

  if (input.action === 'APPROVE' || input.action === 'CORRECT') {
    const [current] = await db
      .select({
        connectionType: schema.connection.connectionType,
        hopCount: schema.connection.hopCount,
        businessRelevanceScore: schema.connection.businessRelevanceScore,
        keywordMatchScore: schema.connection.keywordMatchScore,
        supplyChainScore: schema.connection.supplyChainScore,
        marketReactionScore: schema.connection.marketReactionScore,
        memeScore: schema.connection.memeScore,
        confidenceScore: schema.connection.confidenceScore,
        hasEvidenceGap: schema.connection.hasEvidenceGap,
        isAmbiguousAlias: schema.connection.isAmbiguousAlias,
      })
      .from(schema.connection)
      .where(eq(schema.connection.id, connectionId));

    if (current) {
      const businessRelevance =
        typeof patchSet.businessRelevanceScore === 'number'
          ? patchSet.businessRelevanceScore
          : current.businessRelevanceScore;

      patchSet.relevanceBand = computeRelevanceBand(
        businessRelevance,
        (scoringConfig as unknown as ScoringConfig).relevanceBand,
      );
      patchSet.connectionScore = computeConnectionScore(
        {
          businessRelevance,
          keywordMatch: current.keywordMatchScore,
          supplyChain: current.supplyChainScore,
          marketReaction: current.marketReactionScore === 0 ? null : current.marketReactionScore,
          meme: current.memeScore,
          confidence: current.confidenceScore,
        },
        current.connectionType,
        current.hopCount,
        {
          hasEvidenceGap: current.hasEvidenceGap,
          ambiguousAlias: current.isAmbiguousAlias,
          reviewed: true,
        },
        scoringConfig as unknown as ScoringConfig,
      );
    }
  }

  await db.update(schema.connection).set(patchSet).where(eq(schema.connection.id, connectionId));
}
