import type {
  AnalysisState,
  ConnectionDto,
  ConnectionKind,
  ConnectionScores,
  ConnectionState,
  EntityBrief,
  Evidence,
  Market,
  MarketReaction,
  MemeRankItem,
  MoverItem,
  NewsClusterDto,
  PathStep,
  RelevanceBand,
} from '@gukjang/spec';
import { buildPathPreview } from '../format/path-preview';
import { isMemeConnection } from '../format/tone';

export interface MarketSnapshotRow {
  capturedAt: Date;
  isDelayed: boolean;
  price: number | null;
  changePct: string | number | null;
  volume: string | number | null;
  volumeRatio20: string | number | null;
}

/** market_snapshot 행 → MarketReaction. numeric 컬럼은 postgres.js가 문자열로 반환한다. */
export function toMarketReaction(row: MarketSnapshotRow): MarketReaction {
  return {
    capturedAt: row.capturedAt.toISOString(),
    isDelayed: row.isDelayed,
    price: row.price,
    changePct: row.changePct === null ? null : Number(row.changePct),
    volume: row.volume === null ? null : Number(row.volume),
    volumeRatio20: row.volumeRatio20 === null ? null : Number(row.volumeRatio20),
  };
}

export interface CompanyRow {
  id: number;
  ticker: string;
  name: string;
  market: Market;
  sector: string | null;
}

export interface ConnectionRow {
  id: number;
  clusterId: number;
  connectionType: ConnectionKind;
  businessRelevanceScore: number;
  keywordMatchScore: number;
  supplyChainScore: number;
  marketReactionScore: number;
  memeScore: number;
  confidenceScore: number;
  connectionScore: number;
  relevanceBand: RelevanceBand;
  path: unknown;
  hopCount: number;
  explanation: string;
  caution: string | null;
  counterEvidence: string | null;
  dataSources: unknown;
  status: ConnectionState;
  company: CompanyRow;
  market: MarketReaction | null;
}

/** DB 연결 행 → API DTO (spec/openapi.yaml ConnectionDto와 동일 shape). 순수 함수, IO 없음. */
export function toConnectionDto(row: ConnectionRow): ConnectionDto {
  const scores: ConnectionScores = {
    businessRelevance: row.businessRelevanceScore,
    keywordMatch: row.keywordMatchScore,
    supplyChain: row.supplyChainScore,
    marketReaction: row.marketReactionScore,
    meme: row.memeScore,
    confidence: row.confidenceScore,
    connection: row.connectionScore,
  };
  return {
    id: row.id,
    clusterId: row.clusterId,
    company: row.company,
    type: row.connectionType,
    scores,
    relevanceBand: row.relevanceBand,
    path: (row.path ?? []) as PathStep[],
    hopCount: row.hopCount,
    explanation: row.explanation,
    caution: row.caution,
    counterEvidence: row.counterEvidence,
    market: row.market,
    dataSources: (row.dataSources ?? []) as Evidence[],
    status: row.status,
    isMeme: isMemeConnection(row.connectionType, row.memeScore),
  };
}

export interface NewsClusterRow {
  id: number;
  headline: string;
  emoji: string | null;
  aiSummary: string | null;
  tradeDate: string;
  firstSeenAt: Date;
  articleCount: number;
  heatScore: number;
  analysisStatus: AnalysisState;
  representativeUrl: string;
}

/** docs/05-screen-specs.md S1 — 경로 미리보기 최대 2줄. */
export function toNewsClusterDto(
  row: NewsClusterRow,
  sources: { name: string; url: string }[],
  entities: EntityBrief[],
  topConnections: ConnectionDto[],
): NewsClusterDto {
  return {
    id: row.id,
    headline: row.headline,
    emoji: row.emoji,
    aiSummary: row.aiSummary,
    tradeDate: row.tradeDate,
    firstSeenAt: row.firstSeenAt.toISOString(),
    articleCount: row.articleCount,
    heatScore: row.heatScore,
    analysisStatus: row.analysisStatus,
    representativeUrl: row.representativeUrl,
    sources,
    entities,
    topConnections,
    pathPreviews: topConnections
      .slice(0, 2)
      .map((c) => buildPathPreview(c.path))
      .filter((text) => text.length > 0),
  };
}

/** docs/03-ia.md §4 "😂 오늘의 억지 관련주" — arrowLabel 예시: "원희 → 원익". */
export function toMemeRankItem(connection: ConnectionDto, rank: number): MemeRankItem {
  const entityLabel = connection.path[0]?.label ?? connection.company.name;
  return {
    rank,
    connection,
    arrowLabel: `${entityLabel} → ${connection.company.name}`,
    comment: connection.explanation,
    shareImageUrl: `/api/og/connection/${connection.id}`,
  };
}

export function toMoverItem(
  company: CompanyRow,
  market: MarketReaction,
  connection: ConnectionDto | null,
): MoverItem {
  return { company, market, connection };
}
