/**
 * T2.1.2(중복 제거) + T2.1.3(클러스터링) — docs/11-pipeline.md §2-③④.
 * `news.cluster` 큐(① 완료 시 트리거)가 호출하는 본체. 아직 클러스터에 속하지
 * 않은 기사만 대상으로 하므로, 여러 번 실행해도 안전하다 — 멱등 키는
 * `cluster_article` PK (docs/11 §3).
 *
 * 순서: (③) 최근 창 안에서 simhash 근접 중복을 골라 is_deleted 처리 →
 *       (④) 남은 기사를 오래된 순으로 하나씩 열린 클러스터에 매칭하거나 새로 만든다.
 *
 * 2차(임베딩) 클러스터링은 임베딩 공급자가 아직 정해지지 않아 이 단계에서는 호출하지
 * 않는다 — packages/core의 findMatchingCluster는 임베딩 없이도 1차(자카드)만으로
 * 동작하도록 만들어져 있다 (docs/15 W3 진행 기록 참고).
 *
 * 실행: pnpm --filter @gukjang/worker exec tsx src/collectors/cluster-news.ts
 */
import {
  computeHeatScore,
  findMatchingCluster,
  isBetterRepresentative,
  pickDuplicateArticleIds,
  tokenizeForClustering,
  type HeatScoreConfig,
} from '@gukjang/core';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

const HEAT_SCORE_CONFIG = scoringConfig.heatScore as HeatScoreConfig;
const DEDUP_LOOKBACK_HOURS = 48;
const CLUSTER_WINDOW_HOURS = 24;
const CLUSTER_CANDIDATE_LOOKBACK_HOURS = CLUSTER_WINDOW_HOURS + 1;

export interface ClusterNewsResult {
  candidateArticles: number;
  duplicatesRemoved: number;
  articlesClustered: number;
  clustersCreated: number;
  clustersJoined: number;
  /** news.analyze(⑤⑥) 트리거 대상 — 새로 생긴 클러스터만(docs/11 §1: "④ 신규 클러스터"). */
  createdClusterIds: number[];
}

function kstTradeDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
}

export async function clusterNewArticles(
  db: ReturnType<typeof getDb>,
  now: Date = new Date(),
): Promise<ClusterNewsResult> {
  const dedupCutoff = new Date(now.getTime() - DEDUP_LOOKBACK_HOURS * 60 * 60 * 1000);

  // 아직 어떤 클러스터에도 속하지 않고, 지워지지 않은 기사만 대상으로 한다.
  const candidates = await db
    .select({
      id: schema.newsArticle.id,
      title: schema.newsArticle.title,
      simhash: schema.newsArticle.simhash,
      publishedAt: schema.newsArticle.publishedAt,
      fetchedAt: schema.newsArticle.fetchedAt,
      sourceId: schema.newsArticle.sourceId,
      sourceTier: schema.newsSource.tier,
    })
    .from(schema.newsArticle)
    .innerJoin(schema.newsSource, eq(schema.newsArticle.sourceId, schema.newsSource.id))
    .leftJoin(schema.clusterArticle, eq(schema.clusterArticle.articleId, schema.newsArticle.id))
    .where(
      and(
        isNull(schema.clusterArticle.articleId),
        eq(schema.newsArticle.isDeleted, false),
        gte(schema.newsArticle.publishedAt, dedupCutoff),
      ),
    )
    .orderBy(schema.newsArticle.publishedAt);

  const result: ClusterNewsResult = {
    candidateArticles: candidates.length,
    duplicatesRemoved: 0,
    articlesClustered: 0,
    clustersCreated: 0,
    clustersJoined: 0,
    createdClusterIds: [],
  };
  if (candidates.length === 0) return result;

  // ③ 중복 제거: 창 안에서 simhash 근접 중복은 가장 이른 기사만 남긴다.
  const duplicateIds = pickDuplicateArticleIds(
    candidates.map((c) => ({ id: c.id, simhash: c.simhash, publishedAt: c.publishedAt })),
    3,
  );
  if (duplicateIds.length > 0) {
    await db
      .update(schema.newsArticle)
      .set({ isDeleted: true })
      .where(inArray(schema.newsArticle.id, duplicateIds));
    result.duplicatesRemoved = duplicateIds.length;
  }
  const duplicateIdSet = new Set(duplicateIds);
  const toCluster = candidates.filter((c) => !duplicateIdSet.has(c.id));

  // ④ 클러스터링 대상이 될만한 "열린" 클러스터를 한 번에 불러온다.
  const clusterWindowCutoff = new Date(
    now.getTime() - CLUSTER_CANDIDATE_LOOKBACK_HOURS * 60 * 60 * 1000,
  );
  const repArticle = alias(schema.newsArticle, 'rep_article');
  const openClusterRows = await db
    .select({
      id: schema.newsCluster.id,
      headline: schema.newsCluster.headline,
      firstSeenAt: schema.newsCluster.firstSeenAt,
      lastSeenAt: schema.newsCluster.lastSeenAt,
      articleCount: schema.newsCluster.articleCount,
      sourceTierMin: schema.newsCluster.sourceTierMin,
      representativeArticleId: schema.newsCluster.representativeArticleId,
      representativePublishedAt: repArticle.publishedAt,
    })
    .from(schema.newsCluster)
    .leftJoin(repArticle, eq(schema.newsCluster.representativeArticleId, repArticle.id))
    .where(gte(schema.newsCluster.lastSeenAt, clusterWindowCutoff));

  // 매칭 판정은 인메모리에서, 실제 last_seen_at 갱신도 즉시 반영해 같은 배치 안의
  // 뒤이은 기사가 방금 갱신된 최신 상태를 보고 매칭되도록 한다.
  const openClusters = new Map(
    openClusterRows.map((c) => [
      c.id,
      {
        ...c,
        tokens: tokenizeForClustering(c.headline),
      },
    ]),
  );

  for (const article of toCluster) {
    const articleTokens = tokenizeForClustering(article.title);
    const matchId = findMatchingCluster(
      articleTokens,
      article.publishedAt,
      Array.from(openClusters.values()).map((c) => ({
        id: c.id,
        tokens: c.tokens,
        lastSeenAt: c.lastSeenAt,
        embedding: null,
      })),
      null,
      { windowHours: CLUSTER_WINDOW_HOURS },
    );

    let clusterId: number;
    if (matchId !== null) {
      clusterId = matchId;
      result.clustersJoined++;
    } else {
      const [created] = await db
        .insert(schema.newsCluster)
        .values({
          headline: article.title,
          tradeDate: kstTradeDate(article.publishedAt),
          firstSeenAt: article.publishedAt,
          lastSeenAt: article.publishedAt,
          articleCount: 0, // 아래 공통 업데이트 블록에서 +1 되어 1이 된다.
          sourceTierMin: null,
          heatScore: '0',
        })
        .returning({ id: schema.newsCluster.id });
      if (!created) throw new Error('news_cluster 생성 실패');
      clusterId = created.id;
      openClusters.set(clusterId, {
        id: clusterId,
        headline: article.title,
        firstSeenAt: article.publishedAt,
        lastSeenAt: article.publishedAt,
        articleCount: 0,
        sourceTierMin: null,
        representativeArticleId: null,
        representativePublishedAt: null,
        tokens: articleTokens,
      });
      result.clustersCreated++;
      result.createdClusterIds.push(clusterId);
    }

    await db
      .insert(schema.clusterArticle)
      .values({ clusterId, articleId: article.id })
      .onConflictDoNothing();

    const cluster = openClusters.get(clusterId);
    if (!cluster) throw new Error(`인메모리 클러스터 상태 없음: #${clusterId}`);

    const newArticleCount = cluster.articleCount + 1;
    const newLastSeenAt =
      article.publishedAt.getTime() > cluster.lastSeenAt.getTime()
        ? article.publishedAt
        : cluster.lastSeenAt;
    const newSourceTierMin =
      cluster.sourceTierMin === null
        ? article.sourceTier
        : Math.min(cluster.sourceTierMin, article.sourceTier);

    const currentRep =
      cluster.sourceTierMin !== null && cluster.representativePublishedAt !== null
        ? { sourceTier: cluster.sourceTierMin, publishedAt: cluster.representativePublishedAt }
        : null;
    const shouldReplaceRep =
      !currentRep ||
      isBetterRepresentative(
        { sourceTier: article.sourceTier, publishedAt: article.publishedAt },
        currentRep,
      );

    const newRepresentativeArticleId = shouldReplaceRep
      ? article.id
      : (cluster.representativeArticleId ?? article.id);
    const newHeadline = shouldReplaceRep ? article.title : cluster.headline;
    const newRepresentativePublishedAt = shouldReplaceRep
      ? article.publishedAt
      : (cluster.representativePublishedAt ?? article.publishedAt);

    const recentHourIncrease = await countRecentHourAdditions(db, clusterId, now);
    const heatScore = computeHeatScore(
      { articleCount: newArticleCount, sourceTierMin: newSourceTierMin, recentHourIncrease },
      HEAT_SCORE_CONFIG,
    );

    await db
      .update(schema.newsCluster)
      .set({
        headline: newHeadline,
        lastSeenAt: newLastSeenAt,
        articleCount: newArticleCount,
        sourceTierMin: newSourceTierMin,
        representativeArticleId: newRepresentativeArticleId,
        heatScore: heatScore.toString(),
      })
      .where(eq(schema.newsCluster.id, clusterId));

    openClusters.set(clusterId, {
      ...cluster,
      headline: newHeadline,
      lastSeenAt: newLastSeenAt,
      articleCount: newArticleCount,
      sourceTierMin: newSourceTierMin,
      representativeArticleId: newRepresentativeArticleId,
      representativePublishedAt: newRepresentativePublishedAt,
      tokens: tokenizeForClustering(newHeadline),
    });

    result.articlesClustered++;
  }

  return result;
}

async function countRecentHourAdditions(
  db: ReturnType<typeof getDb>,
  clusterId: number,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.clusterArticle)
    .innerJoin(schema.newsArticle, eq(schema.clusterArticle.articleId, schema.newsArticle.id))
    .where(
      and(
        eq(schema.clusterArticle.clusterId, clusterId),
        gte(schema.newsArticle.fetchedAt, cutoff),
      ),
    );
  return row?.count ?? 0;
}

async function main(): Promise<void> {
  const { getDb: getDbFn, closeDb } = await import('@gukjang/db');
  const db = getDbFn();
  console.log('뉴스 클러스터링 시작…');
  const result = await clusterNewArticles(db);
  console.log('✓ 완료 —', result);
  await closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('✗ 뉴스 클러스터링 실패:', err);
    process.exit(1);
  });
}
