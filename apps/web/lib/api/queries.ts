/**
 * T3.1.2 — /v1/home, /v1/news/* 라우트 핸들러용 DB 조회.
 * Next.js Route Handler가 BFF다(docs/07-api-spec.md §1) — 워커를 거치지 않고 packages/db를
 * 직접 쿼리한다. R7(스코어링은 packages/core 순수 함수) 대상이 아니라 단순 조회+DTO 조립이므로
 * 여기 둔다. DB 통합 동작은 유닛테스트 대상이 아니라 `pnpm dev` + 실 로컬 postgres로 수동 검증한다
 * (apps/worker manual-verify-*.ts와 같은 원칙).
 */
import { normalizeName, recallByAlias, type RecallConfig } from '@gukjang/core';
import { CONNECTION_KIND_META } from '@gukjang/spec';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import { schema, type getDb } from '@gukjang/db';
import type {
  ConnectionDto,
  ConnectionKind,
  ConnectionState,
  Evidence,
  EntityBrief,
  EntityDetailDto,
  GraphDto,
  HomeDto,
  MarketReaction,
  MoverItem,
  NewsClusterDto,
} from '@gukjang/spec';
import { and, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { buildClusterGraph, type EdgeFactRow } from './graph';
import {
  toConnectionDto,
  toMarketReaction,
  toMemeRankItem,
  toMoverItem,
  toNewsClusterDto,
  type CompanyRow,
  type ConnectionRow,
} from './mappers';

type Db = ReturnType<typeof getDb>;

/** docs/13-validation.md — PENDING/REJECTED는 검수 대기·탈락이라 공개 화면에 노출하지 않는다. */
const VISIBLE_STATUSES: ConnectionState[] = ['ACTIVE', 'DISPUTED', 'CORRECTED'];

export async function latestTradeDate(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ maxDate: sql<string | null>`max(${schema.newsCluster.tradeDate})` })
    .from(schema.newsCluster);
  return row?.maxDate ?? null;
}

async function connectionsForClusters(
  db: Db,
  clusterIds: number[],
  limitPerCluster: number,
): Promise<Map<number, ConnectionDto[]>> {
  const byCluster = new Map<number, ConnectionDto[]>();
  if (clusterIds.length === 0) return byCluster;

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
    .where(
      and(
        inArray(schema.connection.clusterId, clusterIds),
        inArray(schema.connection.status, VISIBLE_STATUSES),
      ),
    )
    .orderBy(desc(schema.connection.connectionScore));

  for (const r of rows) {
    const list = byCluster.get(r.clusterId) ?? [];
    if (list.length >= limitPerCluster) continue;
    const row: ConnectionRow = {
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
    };
    list.push(toConnectionDto(row));
    byCluster.set(r.clusterId, list);
  }
  return byCluster;
}

async function entitiesForClusters(
  db: Db,
  clusterIds: number[],
): Promise<Map<number, EntityBrief[]>> {
  const byCluster = new Map<number, EntityBrief[]>();
  if (clusterIds.length === 0) return byCluster;

  const rows = await db
    .select({
      clusterId: schema.newsEntity.clusterId,
      importance: schema.newsEntity.importance,
      id: schema.entity.id,
      name: schema.entity.name,
      kind: schema.entity.kind,
      subtype: schema.entity.subtype,
    })
    .from(schema.newsEntity)
    .innerJoin(schema.entity, eq(schema.entity.id, schema.newsEntity.entityId))
    .where(inArray(schema.newsEntity.clusterId, clusterIds))
    .orderBy(desc(schema.newsEntity.importance));

  for (const r of rows) {
    const list = byCluster.get(r.clusterId) ?? [];
    list.push({
      id: r.id,
      name: r.name,
      kind: r.kind,
      subtype: r.subtype,
      importance: Number(r.importance),
    });
    byCluster.set(r.clusterId, list);
  }
  return byCluster;
}

async function sourcesForClusters(
  db: Db,
  clusterIds: number[],
): Promise<Map<number, { name: string; url: string }[]>> {
  const byCluster = new Map<number, { name: string; url: string }[]>();
  if (clusterIds.length === 0) return byCluster;

  const rows = await db
    .select({
      clusterId: schema.clusterArticle.clusterId,
      name: schema.newsSource.name,
      url: schema.newsArticle.url,
    })
    .from(schema.clusterArticle)
    .innerJoin(schema.newsArticle, eq(schema.newsArticle.id, schema.clusterArticle.articleId))
    .innerJoin(schema.newsSource, eq(schema.newsSource.id, schema.newsArticle.sourceId))
    .where(inArray(schema.clusterArticle.clusterId, clusterIds));

  for (const r of rows) {
    const list = byCluster.get(r.clusterId) ?? [];
    list.push({ name: r.name, url: r.url });
    byCluster.set(r.clusterId, list);
  }
  return byCluster;
}

async function buildNewsClusterDtos(
  db: Db,
  clusterRows: (typeof schema.newsCluster.$inferSelect)[],
): Promise<NewsClusterDto[]> {
  const ids = clusterRows.map((c) => c.id);
  const [connections, entities, sources, repUrls] = await Promise.all([
    connectionsForClusters(db, ids, 4),
    entitiesForClusters(db, ids),
    sourcesForClusters(db, ids),
    representativeUrls(db, clusterRows),
  ]);

  return clusterRows.map((c) =>
    toNewsClusterDto(
      {
        id: c.id,
        headline: c.headline,
        emoji: c.emoji,
        aiSummary: c.aiSummary,
        tradeDate: c.tradeDate,
        firstSeenAt: c.firstSeenAt,
        articleCount: c.articleCount,
        heatScore: Number(c.heatScore),
        analysisStatus: c.analysisStatus,
        representativeUrl: repUrls.get(c.id) ?? '',
      },
      sources.get(c.id) ?? [],
      entities.get(c.id) ?? [],
      connections.get(c.id) ?? [],
    ),
  );
}

async function representativeUrls(
  db: Db,
  clusterRows: (typeof schema.newsCluster.$inferSelect)[],
): Promise<Map<number, string>> {
  const articleIds = clusterRows
    .map((c) => c.representativeArticleId)
    .filter((id): id is number => id !== null);
  const result = new Map<number, string>();
  if (articleIds.length === 0) return result;

  const rows = await db
    .select({ id: schema.newsArticle.id, url: schema.newsArticle.url })
    .from(schema.newsArticle)
    .where(inArray(schema.newsArticle.id, articleIds));
  const urlByArticleId = new Map(rows.map((r) => [r.id, r.url]));

  for (const c of clusterRows) {
    const url = c.representativeArticleId
      ? urlByArticleId.get(c.representativeArticleId)
      : undefined;
    if (url) result.set(c.id, url);
  }
  return result;
}

/** docs/03-ia.md §4 블록1 — MEME 연결 또는 meme_score≥70 상위 3건. */
/** GET /v1/discovery/meme — spec/openapi.yaml. docs/03-ia.md §4 블록1과 같은 쿼리(limit만 다름). */
/**
 * docs/05-screen-specs.md S5 "오늘의 억지 관련주" — 회사당 최고 memeScore 1건만 남긴다
 * (getWeeklyMemeHallOfFame과 같은 원칙). 회사별 dedup이 없으면 같은 회사가 여러 뉴스
 * 클러스터에서 각각 MEME 연결을 만들었을 때 TOP N을 그 회사 하나가 다 차지해버린다
 * (2026-08-22 실 사용자 신고로 발견 — "노루페인트"가 1~3등을 전부 차지하는 문제).
 */
export async function getMemeRank(
  db: Db,
  tradeDate: string,
  limit = 3,
): Promise<HomeDto['memeRank']> {
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
    .where(
      and(
        eq(schema.connection.tradeDate, tradeDate),
        inArray(schema.connection.status, VISIBLE_STATUSES),
        sql`(${schema.connection.connectionType} = 'MEME' OR ${schema.connection.memeScore} >= 70)`,
      ),
    )
    .orderBy(desc(schema.connection.memeScore));

  const bestByCompany = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    if (!bestByCompany.has(r.companyId)) bestByCompany.set(r.companyId, r);
  }

  return [...bestByCompany.values()].slice(0, limit).map((r, i) => {
    const row: ConnectionRow = {
      ...r,
      company: {
        id: r.companyId,
        ticker: r.companyTicker,
        name: r.companyName,
        market: r.companyMarket,
        sector: r.companySector,
      },
      market: null,
    };
    return toMemeRankItem(toConnectionDto(row), i + 1);
  });
}

/** docs/05-screen-specs.md S5 — "이번 주 명예의 전당". 회사당 최고 memeScore 1건만 남긴다. */
export async function getWeeklyMemeHallOfFame(
  db: Db,
  endDate: string,
  limit = 10,
): Promise<HomeDto['memeRank']> {
  const start = new Date(endDate);
  start.setDate(start.getDate() - 6);
  const startDate = start.toISOString().slice(0, 10);

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
    .where(
      and(
        gte(schema.connection.tradeDate, startDate),
        lte(schema.connection.tradeDate, endDate),
        inArray(schema.connection.status, VISIBLE_STATUSES),
        sql`(${schema.connection.connectionType} = 'MEME' OR ${schema.connection.memeScore} >= 70)`,
      ),
    )
    .orderBy(desc(schema.connection.memeScore));

  const bestByCompany = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    if (!bestByCompany.has(r.companyId)) bestByCompany.set(r.companyId, r);
  }

  return [...bestByCompany.values()].slice(0, limit).map((r, i) => {
    const row: ConnectionRow = {
      ...r,
      company: {
        id: r.companyId,
        ticker: r.companyTicker,
        name: r.companyName,
        market: r.companyMarket,
        sector: r.companySector,
      },
      market: null,
    };
    return toMemeRankItem(toConnectionDto(row), i + 1);
  });
}

/** docs/03-ia.md §4 블록3 — 급등/급락 상위 10 + 매칭 연결(없으면 null, R1). */
async function getMovers(db: Db, tradeDate: string): Promise<MoverItem[]> {
  const snapshotRows = await db
    .select({
      companyId: schema.marketSnapshot.companyId,
      capturedAt: schema.marketSnapshot.capturedAt,
      price: schema.marketSnapshot.price,
      changePct: schema.marketSnapshot.changePct,
      volume: schema.marketSnapshot.volume,
      volumeRatio20: schema.marketSnapshot.volumeRatio20,
      isDelayed: schema.marketSnapshot.isDelayed,
      companyTicker: schema.company.ticker,
      companyName: schema.company.name,
      companyMarket: schema.company.market,
      companySector: schema.company.sector,
    })
    .from(schema.marketSnapshot)
    .innerJoin(schema.company, eq(schema.company.id, schema.marketSnapshot.companyId))
    .where(eq(schema.marketSnapshot.tradeDate, tradeDate))
    .orderBy(desc(sql`abs(${schema.marketSnapshot.changePct})`))
    .limit(10);

  if (snapshotRows.length === 0) return [];

  const companyIds = snapshotRows.map((r) => r.companyId);
  const connectionRows = await db
    .select({
      companyId: schema.connection.companyId,
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
    })
    .from(schema.connection)
    .where(
      and(
        inArray(schema.connection.companyId, companyIds),
        eq(schema.connection.tradeDate, tradeDate),
        inArray(schema.connection.status, VISIBLE_STATUSES),
      ),
    )
    .orderBy(desc(schema.connection.connectionScore));

  const bestConnectionByCompany = new Map<number, (typeof connectionRows)[number]>();
  for (const c of connectionRows) {
    if (!bestConnectionByCompany.has(c.companyId)) bestConnectionByCompany.set(c.companyId, c);
  }

  return snapshotRows.map((r) => {
    const company: CompanyRow = {
      id: r.companyId,
      ticker: r.companyTicker,
      name: r.companyName,
      market: r.companyMarket,
      sector: r.companySector,
    };
    const market: MarketReaction = {
      capturedAt: r.capturedAt.toISOString(),
      isDelayed: r.isDelayed,
      price: r.price,
      changePct: r.changePct === null ? null : Number(r.changePct),
      volume: r.volume === null ? null : Number(r.volume),
      volumeRatio20: r.volumeRatio20 === null ? null : Number(r.volumeRatio20),
    };
    const best = bestConnectionByCompany.get(r.companyId);
    const connection = best ? toConnectionDto({ ...best, company, market }) : null;
    return toMoverItem(company, market, connection);
  });
}

/** docs/03-ia.md §4 블록4 — 최근 60분 신규 연결. */
async function getRecentConnections(db: Db, limit = 20): Promise<ConnectionDto[]> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
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
      createdAt: schema.connection.createdAt,
      companyId: schema.company.id,
      companyTicker: schema.company.ticker,
      companyName: schema.company.name,
      companyMarket: schema.company.market,
      companySector: schema.company.sector,
    })
    .from(schema.connection)
    .innerJoin(schema.company, eq(schema.company.id, schema.connection.companyId))
    .where(
      and(
        gte(schema.connection.createdAt, since),
        inArray(schema.connection.status, VISIBLE_STATUSES),
      ),
    )
    .orderBy(desc(schema.connection.createdAt))
    .limit(limit);

  return rows.map((r) =>
    toConnectionDto({
      ...r,
      company: {
        id: r.companyId,
        ticker: r.companyTicker,
        name: r.companyName,
        market: r.companyMarket,
        sector: r.companySector,
      },
      market: null,
    }),
  );
}

/** GET /v1/home — spec/openapi.yaml. date 미지정 시 최근 거래일(트래픽 대부분, docs/07 §2 캐시 대상). */
export async function getHomeData(db: Db, date?: string): Promise<HomeDto> {
  const tradeDate = date ?? (await latestTradeDate(db));

  if (!tradeDate) {
    return {
      tradeDate: new Date().toISOString().slice(0, 10),
      memeRank: [],
      clusters: [],
      movers: [],
      recentConnections: [],
      marketAsOf: new Date().toISOString(),
      isPreMarket: true,
    };
  }

  const clusterRows = await db
    .select()
    .from(schema.newsCluster)
    .where(eq(schema.newsCluster.tradeDate, tradeDate))
    .orderBy(desc(schema.newsCluster.heatScore), desc(schema.newsCluster.firstSeenAt))
    .limit(5);

  const [clusters, memeRank, movers, recentConnections] = await Promise.all([
    buildNewsClusterDtos(db, clusterRows),
    getMemeRank(db, tradeDate),
    getMovers(db, tradeDate),
    getRecentConnections(db),
  ]);

  const kstHour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Seoul',
    }).format(new Date()),
  );

  return {
    tradeDate,
    memeRank,
    clusters,
    movers,
    recentConnections,
    marketAsOf: movers[0]?.market.capturedAt ?? new Date().toISOString(),
    isPreMarket: kstHour < 8,
  };
}

/** GET /v1/news/{clusterId} — spec/openapi.yaml. docs/05-screen-specs.md S2. */
export async function getNewsClusterDetail(
  db: Db,
  clusterId: number,
): Promise<NewsClusterDto | null> {
  const [row] = await db
    .select()
    .from(schema.newsCluster)
    .where(eq(schema.newsCluster.id, clusterId));
  if (!row) return null;

  const [connections, entities, sources, repUrls] = await Promise.all([
    connectionsForClusters(db, [clusterId], 100),
    entitiesForClusters(db, [clusterId]),
    sourcesForClusters(db, [clusterId]),
    representativeUrls(db, [row]),
  ]);

  return toNewsClusterDto(
    {
      id: row.id,
      headline: row.headline,
      emoji: row.emoji,
      aiSummary: row.aiSummary,
      tradeDate: row.tradeDate,
      firstSeenAt: row.firstSeenAt,
      articleCount: row.articleCount,
      heatScore: Number(row.heatScore),
      analysisStatus: row.analysisStatus,
      representativeUrl: repUrls.get(row.id) ?? '',
    },
    sources.get(clusterId) ?? [],
    entities.get(clusterId) ?? [],
    connections.get(clusterId) ?? [],
  );
}

export interface ConnectionListOptions {
  types?: ConnectionKind[];
  sort?: 'connection' | 'market' | 'business';
  businessOnly?: boolean;
  includeMeme?: boolean;
}

/**
 * GET /v1/news/{clusterId}/connections — spec/openapi.yaml.
 * 데이터 규모가 작아(클러스터당 연결 수십 건 이하) 필터·정렬은 애플리케이션에서 처리한다.
 */
export async function getConnectionsForCluster(
  db: Db,
  clusterId: number,
  opts: ConnectionListOptions = {},
): Promise<ConnectionDto[]> {
  const byCluster = await connectionsForClusters(db, [clusterId], 200);
  let list = byCluster.get(clusterId) ?? [];

  if (opts.types && opts.types.length > 0) {
    const typeSet = new Set(opts.types);
    list = list.filter((c) => typeSet.has(c.type));
  }
  if (opts.businessOnly) {
    list = list.filter((c) => CONNECTION_KIND_META[c.type].countsAsBusiness);
  }
  if (opts.includeMeme === false) {
    list = list.filter((c) => !c.isMeme);
  }

  const sortKey = opts.sort ?? 'connection';
  const scoreOf =
    sortKey === 'market'
      ? (c: ConnectionDto) => c.scores.marketReaction
      : sortKey === 'business'
        ? (c: ConnectionDto) => c.scores.businessRelevance
        : (c: ConnectionDto) => c.scores.connection;
  return [...list].sort((a, b) => scoreOf(b) - scoreOf(a));
}

function toEvidence(raw: unknown): Evidence | null {
  if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) return null;
  return raw as Evidence;
}

/** 클러스터의 연결 경로가 실제로 지나는 (src,dst,type) 엣지의 진짜 weight/confidence/evidence. */
async function edgeFactsForPaths(db: Db, connections: ConnectionDto[]): Promise<EdgeFactRow[]> {
  const nodeIds = new Set<number>();
  const edgeTypes = new Set<string>();
  for (const c of connections) {
    for (const step of c.path) {
      nodeIds.add(step.nodeId);
      if (step.edgeType) edgeTypes.add(step.edgeType);
    }
  }
  if (nodeIds.size === 0) return [];

  const rows = await db
    .select({
      srcNodeId: schema.graphEdge.srcNodeId,
      dstNodeId: schema.graphEdge.dstNodeId,
      edgeType: schema.graphEdge.edgeType,
      weight: schema.graphEdge.weight,
      confidence: schema.graphEdge.confidence,
      evidence: schema.graphEdge.evidence,
    })
    .from(schema.graphEdge)
    .where(
      or(
        inArray(schema.graphEdge.srcNodeId, [...nodeIds]),
        inArray(schema.graphEdge.dstNodeId, [...nodeIds]),
      ),
    );

  return rows.map((r) => ({
    srcNodeId: r.srcNodeId,
    dstNodeId: r.dstNodeId,
    edgeType: r.edgeType,
    weight: Number(r.weight),
    confidence: Number(r.confidence),
    evidence: toEvidence(r.evidence),
  }));
}

/**
 * graph_node.id(경로 노드 id) → entity.id. C9 개체 허브(V1.1, docs/19 §3) 링크가 정확한
 * entity.id를 가리키려면 필요하다 — ENTITY 노드는 `ensureGraphNode`가 생성 시점에
 * `ref_id`를 그대로 entity.id로 넣어두므로(apps/worker/src/graph/ensure-node.ts) 조회만
 * 하면 된다.
 */
async function entityIdsForNodeIds(
  db: Db,
  nodeIds: readonly number[],
): Promise<Map<number, number>> {
  if (nodeIds.length === 0) return new Map();
  const rows = await db
    .select({ id: schema.graphNode.id, refId: schema.graphNode.refId })
    .from(schema.graphNode)
    .where(and(eq(schema.graphNode.kind, 'ENTITY'), inArray(schema.graphNode.id, [...nodeIds])));
  return new Map(rows.map((r) => [r.id, r.refId]));
}

/** GET /v1/news/{clusterId}/graph — spec/openapi.yaml. docs/05-screen-specs.md S3(제품 핵심). */
export async function getGraphForCluster(
  db: Db,
  clusterId: number,
  opts: { maxNodes?: number; minScore?: number } = {},
): Promise<GraphDto | null> {
  const [row] = await db
    .select()
    .from(schema.newsCluster)
    .where(eq(schema.newsCluster.id, clusterId));
  if (!row) return null;

  const byCluster = await connectionsForClusters(db, [clusterId], 200);
  const minScore = opts.minScore ?? 0;
  const connections = (byCluster.get(clusterId) ?? [])
    .filter((c) => c.scores.connection >= minScore)
    .sort((a, b) => b.scores.connection - a.scores.connection);

  const edgeFacts = await edgeFactsForPaths(db, connections);
  const allNodeIds = connections.flatMap((c) => c.path.map((s) => s.nodeId));
  const entityIdByNodeId = await entityIdsForNodeIds(db, allNodeIds);

  return buildClusterGraph(
    { id: row.id, headline: row.headline },
    connections,
    edgeFacts,
    opts.maxNodes ?? 60,
    entityIdByNodeId,
  );
}

export interface StockDetailDto {
  company: CompanyRow;
  market: MarketReaction | null;
  /** 최근 5거래일 종가(마감 직전 스냅샷). 캔들 아님 — docs/05 S4 §5. */
  spark: number[];
}

/** GET /v1/stocks/{ticker} — spec/openapi.yaml. */
export async function getStockDetail(db: Db, ticker: string): Promise<StockDetailDto | null> {
  const [company] = await db.select().from(schema.company).where(eq(schema.company.ticker, ticker));
  if (!company) return null;

  const snapshots = await db
    .select({
      capturedAt: schema.marketSnapshot.capturedAt,
      tradeDate: schema.marketSnapshot.tradeDate,
      isDelayed: schema.marketSnapshot.isDelayed,
      price: schema.marketSnapshot.price,
      changePct: schema.marketSnapshot.changePct,
      volume: schema.marketSnapshot.volume,
      volumeRatio20: schema.marketSnapshot.volumeRatio20,
    })
    .from(schema.marketSnapshot)
    .where(eq(schema.marketSnapshot.companyId, company.id))
    .orderBy(desc(schema.marketSnapshot.capturedAt))
    .limit(200); // 최근 며칠치 5분 스냅샷 — 거래일별 마지막 값만 골라 쓴다

  const latest = snapshots[0];
  const market = latest ? toMarketReaction(latest) : null;

  const lastPriceByDate = new Map<string, number>();
  for (const s of snapshots) {
    if (s.price === null) continue;
    if (!lastPriceByDate.has(s.tradeDate)) lastPriceByDate.set(s.tradeDate, s.price);
  }
  const spark = [...lastPriceByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-5)
    .map(([, price]) => price);

  return {
    company: {
      id: company.id,
      ticker: company.ticker,
      name: company.name,
      market: company.market,
      sector: company.sector,
    },
    market,
    spark,
  };
}

/**
 * GET /v1/stocks/{ticker}/connections — spec/openapi.yaml. 역방향(이 종목에 걸린 뉴스).
 * "연결이 없으면 빈 배열. 억지로 만들지 않는다"(R1) — 그대로 빈 배열을 반환한다.
 */
export async function getConnectionsForStock(
  db: Db,
  ticker: string,
  opts: { date?: string; days?: number } = {},
): Promise<ConnectionDto[]> {
  const [company] = await db.select().from(schema.company).where(eq(schema.company.ticker, ticker));
  if (!company) return [];

  const endDate = opts.date ?? (await latestTradeDate(db)) ?? new Date().toISOString().slice(0, 10);
  const days = opts.days ?? 1;
  const start = new Date(endDate);
  start.setDate(start.getDate() - (days - 1));
  const startDate = start.toISOString().slice(0, 10);

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
    })
    .from(schema.connection)
    .where(
      and(
        eq(schema.connection.companyId, company.id),
        gte(schema.connection.tradeDate, startDate),
        lte(schema.connection.tradeDate, endDate),
        inArray(schema.connection.status, VISIBLE_STATUSES),
      ),
    )
    .orderBy(desc(schema.connection.connectionScore));

  const companyBrief: CompanyRow = {
    id: company.id,
    ticker: company.ticker,
    name: company.name,
    market: company.market,
    sector: company.sector,
  };

  return rows.map((r) => toConnectionDto({ ...r, company: companyBrief, market: null }));
}

/**
 * C9 개체 허브(V1.1, docs/19 §3) — 이 개체가 `connection.anchor_entity_id`인 연결 전부를
 * 역방향 조회한다(R1: 없으면 정직하게 빈 배열, getConnectionsForStock과 같은 원칙).
 */
export async function getEntityDetail(db: Db, entityId: number): Promise<EntityDetailDto | null> {
  const [entityRow] = await db.select().from(schema.entity).where(eq(schema.entity.id, entityId));
  if (!entityRow) return null;

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
    .where(
      and(
        eq(schema.connection.anchorEntityId, entityId),
        inArray(schema.connection.status, VISIBLE_STATUSES),
      ),
    )
    .orderBy(desc(schema.connection.connectionScore));

  const connections = rows.map((r) =>
    toConnectionDto({
      ...r,
      company: {
        id: r.companyId,
        ticker: r.companyTicker,
        name: r.companyName,
        market: r.companyMarket,
        sector: r.companySector,
      },
      market: null,
    }),
  );

  return {
    id: entityRow.id,
    name: entityRow.name,
    kind: entityRow.kind,
    subtype: entityRow.subtype,
    mentionTotal: entityRow.mentionTotal,
    connections,
  };
}

/** OG 이미지(`/api/og/connection/{id}`)용 단건 조회. */
export async function getConnectionById(
  db: Db,
  connectionId: number,
): Promise<ConnectionDto | null> {
  const [row] = await db
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
    .where(eq(schema.connection.id, connectionId));

  if (!row) return null;
  return toConnectionDto({
    ...row,
    company: {
      id: row.companyId,
      ticker: row.companyTicker,
      name: row.companyName,
      market: row.companyMarket,
      sector: row.companySector,
    },
    market: null,
  });
}

export interface SearchResultDto {
  news: NewsClusterDto[];
  companies: CompanyRow[];
  entities: EntityBrief[];
  suggestions: string[];
}

/**
 * GET /v1/search — spec/openapi.yaml. docs/05-screen-specs.md S6.
 * "기업 검색은 티커·정식명·약칭·구 사명·영문명 모두 매칭" — company/company_alias
 * gin_trgm 인덱스를 그대로 타는 ILIKE 부분일치로 구현한다. 0건이면 자모 유사도 기반
 * (`@gukjang/core` recallByAlias, T2.3.1과 같은 엔진) 제안을 붙인다.
 */
export async function getSearchResults(
  db: Db,
  q: string,
  kind: 'all' | 'news' | 'company' | 'keyword' = 'all',
): Promise<SearchResultDto> {
  const qNorm = normalizeName(q);
  const like = `%${q}%`;

  let companies: CompanyRow[] = [];
  if (kind === 'all' || kind === 'company') {
    const aliasMatches = await db
      .select({ companyId: schema.companyAlias.companyId })
      .from(schema.companyAlias)
      .where(sql`${schema.companyAlias.aliasNorm} ILIKE ${like}`);
    const aliasCompanyIds = aliasMatches.map((r) => r.companyId);

    const companyRows = await db
      .select()
      .from(schema.company)
      .where(
        or(
          eq(schema.company.ticker, q),
          sql`${schema.company.nameNorm} ILIKE ${like}`,
          aliasCompanyIds.length > 0 ? inArray(schema.company.id, aliasCompanyIds) : undefined,
        ),
      )
      .limit(10);
    companies = companyRows.map((c) => ({
      id: c.id,
      ticker: c.ticker,
      name: c.name,
      market: c.market,
      sector: c.sector,
    }));
  }

  let news: NewsClusterDto[] = [];
  if (kind === 'all' || kind === 'news') {
    const clusterRows = await db
      .select()
      .from(schema.newsCluster)
      .where(sql`${schema.newsCluster.headline} ILIKE ${like}`)
      .orderBy(desc(schema.newsCluster.heatScore), desc(schema.newsCluster.firstSeenAt))
      .limit(5);
    news = await buildNewsClusterDtos(db, clusterRows);
  }

  let entities: EntityBrief[] = [];
  if (kind === 'all' || kind === 'keyword') {
    const entityRows = await db
      .select()
      .from(schema.entity)
      .where(sql`${schema.entity.nameNorm} ILIKE ${like}`)
      .orderBy(desc(schema.entity.mentionTotal))
      .limit(10);
    entities = entityRows.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      subtype: e.subtype,
      importance: Math.min(e.mentionTotal / 50, 1),
    }));
  }

  let suggestions: string[] = [];
  if (companies.length === 0 && qNorm.length > 0) {
    const aliasRows = await db
      .select({
        companyId: schema.company.id,
        companyName: schema.company.name,
        companyTicker: schema.company.ticker,
        alias: schema.companyAlias.alias,
        aliasNorm: schema.companyAlias.aliasNorm,
        aliasType: schema.companyAlias.aliasType,
        isAmbiguous: schema.companyAlias.isAmbiguous,
      })
      .from(schema.companyAlias)
      .innerJoin(schema.company, eq(schema.company.id, schema.companyAlias.companyId));

    const hits = recallByAlias(q, aliasRows, scoringConfig.recall as RecallConfig);
    suggestions = [...new Set(hits.map((h) => h.companyName))].slice(0, 3);
  }

  return { news, companies, entities, suggestions };
}
