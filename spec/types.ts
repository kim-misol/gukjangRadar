/**
 * 국장레이더 공용 타입 — 단일 진실 원천.
 * enum 을 다른 파일이나 문서에 중복 정의하지 말 것. 여기서 import 한다.
 * spec/schema.sql 의 ENUM 과 1:1 대응. 한쪽만 바꾸지 말 것.
 */

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────
export const MARKETS = ['KOSPI', 'KOSDAQ', 'KONEX'] as const;
export type Market = (typeof MARKETS)[number];

export const NODE_KINDS = ['NEWS', 'ENTITY', 'CONCEPT', 'COMPANY'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const ENTITY_KINDS = [
  'PERSON', 'ORG', 'PLACE', 'PRODUCT', 'EVENT', 'BRAND', 'WORD', 'TIME', 'NUMBER', 'OTHER',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ALIAS_KINDS = [
  'OFFICIAL', 'SHORT', 'ENGLISH', 'FORMER', 'BRAND', 'TICKER', 'NICKNAME',
] as const;
export type AliasKind = (typeof ALIAS_KINDS)[number];

/** 그래프 엣지 = 세상에 대한 사실 */
export const EDGE_KINDS = [
  'MENTIONS', 'NAME_MATCH', 'NAME_SIMILAR', 'AFFILIATION', 'SUPPLY_CHAIN',
  'PRODUCES', 'BELONGS_TO', 'RELATED_CONCEPT', 'PERSON_OF', 'LOCATED_IN', 'EVENT_IMPACT',
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** 연결 = 특정 뉴스에 대한 해석 결과 (사용자에게 보이는 유형) */
export const CONNECTION_KINDS = [
  'DIRECT', 'SUPPLY_CHAIN', 'THEME', 'PERSON', 'PRODUCT', 'LOCATION',
  'EVENT', 'KEYWORD', 'NAME_MATCH', 'AFFILIATION', 'MEME',
] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

/** UI 표기: 라벨 / 아이콘 / 사업연관성 축에 포함되는가 */
export const CONNECTION_KIND_META: Record<
  ConnectionKind,
  { label: string; icon: string; countsAsBusiness: boolean }
> = {
  DIRECT:       { label: '사업 직접 연관', icon: '🎯', countsAsBusiness: true },
  SUPPLY_CHAIN: { label: '공급망',        icon: '🔗', countsAsBusiness: true },
  THEME:        { label: '테마',          icon: '🌊', countsAsBusiness: true },
  PERSON:       { label: '인물',          icon: '👤', countsAsBusiness: true },
  PRODUCT:      { label: '제품',          icon: '📦', countsAsBusiness: true },
  LOCATION:     { label: '지역',          icon: '📍', countsAsBusiness: true },
  EVENT:        { label: '행사·이슈',     icon: '📅', countsAsBusiness: true },
  AFFILIATION:  { label: '계열 관계',     icon: '🏢', countsAsBusiness: true },
  KEYWORD:      { label: '키워드',        icon: '🔤', countsAsBusiness: false },
  NAME_MATCH:   { label: '이름 일치',     icon: '🔤', countsAsBusiness: false },
  MEME:         { label: '밈성 연결',     icon: '😂', countsAsBusiness: false },
};

export const EDGE_ORIGINS = ['RULE', 'DART', 'DICTIONARY', 'LLM', 'HUMAN', 'MARKET'] as const;
export type EdgeOrigin = (typeof EDGE_ORIGINS)[number];

export const CONNECTION_STATES = ['PENDING', 'ACTIVE', 'DISPUTED', 'REJECTED', 'CORRECTED'] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

export const ANALYSIS_STATES = ['PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED'] as const;
export type AnalysisState = (typeof ANALYSIS_STATES)[number];

export const RELEVANCE_BANDS = ['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
export type RelevanceBand = (typeof RELEVANCE_BANDS)[number];

export const FEEDBACK_KINDS = ['UNDERSTOOD', 'FARFETCHED', 'WRONG'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** 0~100 정수 점수 */
export type Score100 = number;

// ─────────────────────────────────────────────
// 도메인 DTO (API 응답과 동일 shape)
// ─────────────────────────────────────────────
export interface Evidence {
  /** 룰 ID 또는 데이터 출처 종류 */
  rule?: string;
  source: EdgeOrigin | string;
  /** 사용자에게 보여줄 근거 한 줄 */
  label: string;
  url?: string;
  docNo?: string;
  fetchedAt?: string;
}

export interface GraphNodeDto {
  id: number;
  kind: NodeKind;
  refId: number;
  label: string;
  /** COMPANY 노드에만 존재 */
  ticker?: string;
  /** ENTITY 노드에만 존재 */
  entityKind?: EntityKind;
  /** 레인 배치용. 0=NEWS, 1=ENTITY, 2=CONCEPT, 3=COMPANY */
  lane: 0 | 1 | 2 | 3;
}

export interface GraphEdgeDto {
  id: number;
  src: number;
  dst: number;
  type: EdgeKind;
  weight: number;      // 0~1
  confidence: number;  // 0~1
  label: string;       // 템플릿 생성 (LLM 아님)
  evidence: Evidence | null;
}

export interface GraphDto {
  clusterId: number;
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  /** 그래프를 못 그리는 클라이언트용 텍스트 폴백 */
  textPaths: string[]; // ["태풍 노루 → 노루 → 노루페인트", ...]
  truncated: boolean;
}

export interface PathStep {
  nodeId: number;
  kind: NodeKind;
  label: string;
  /** 이 스텝으로 들어온 엣지 (첫 스텝은 없음) */
  edgeType?: EdgeKind;
  edgeLabel?: string;
  evidenceUrl?: string;
}

export interface ConnectionScores {
  businessRelevance: Score100;
  keywordMatch: Score100;
  supplyChain: Score100;
  marketReaction: Score100;
  meme: Score100;
  confidence: Score100;
  /** 종합 '연결 강도'. 미래 수익률 예측이 아니다. */
  connection: Score100;
}

export interface CompanyBrief {
  id: number;
  ticker: string;
  name: string;
  market: Market;
  sector: string | null;
}

export interface MarketReaction {
  capturedAt: string;
  isDelayed: boolean;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  /** 20일 평균 대비 배수. 1.83 = +83% */
  volumeRatio20: number | null;
}

export interface ConnectionDto {
  id: number;
  clusterId: number;
  company: CompanyBrief;
  type: ConnectionKind;
  scores: ConnectionScores;
  relevanceBand: RelevanceBand;
  path: PathStep[];
  hopCount: number;
  /** 사용자 노출 설명. 금지어 린터 통과 필수. */
  explanation: string;
  /** 투자자가 오해할 수 있는 부분 */
  caution: string | null;
  /** 사업 연관성 주장에 대한 반증 검사 결과 */
  counterEvidence: string | null;
  market: MarketReaction | null;
  dataSources: Evidence[];
  status: ConnectionState;
  isMeme: boolean;
}

export interface EntityBrief {
  id: number;
  name: string;
  kind: EntityKind;
  subtype: string | null;
  importance: number; // 0~1
}

export interface NewsClusterDto {
  id: number;
  headline: string;
  emoji: string | null;
  /** AI 3문장 요약. 원문 인용 20자 초과 금지. */
  aiSummary: string | null;
  tradeDate: string;
  firstSeenAt: string;
  articleCount: number;
  heatScore: number;
  analysisStatus: AnalysisState;
  representativeUrl: string;
  sources: { name: string; url: string }[];
  entities: EntityBrief[];
  /** 미리보기용 상위 연결. 전체는 /connections */
  topConnections: ConnectionDto[];
  /** "태풍 노루 → 노루 → 노루페인트" 형태 미리보기 최대 2줄 */
  pathPreviews: string[];
}

export interface MemeRankItem {
  rank: number;
  connection: ConnectionDto;
  /** "원희 → 원익" */
  arrowLabel: string;
  comment: string;
  shareImageUrl: string;
}

export interface MoverItem {
  company: CompanyBrief;
  market: MarketReaction;
  /** 연결을 못 찾으면 null — 억지로 만들지 않는다 (R1) */
  connection: ConnectionDto | null;
}

export interface HomeDto {
  tradeDate: string;
  memeRank: MemeRankItem[];
  clusters: NewsClusterDto[];
  movers: MoverItem[];
  recentConnections: ConnectionDto[];
  marketAsOf: string;
  isPreMarket: boolean;
}

// ─────────────────────────────────────────────
// 파이프라인 내부 타입 (API 노출 안 함)
// ─────────────────────────────────────────────
export interface Candidate {
  companyId: number;
  ticker: string;
  name: string;
  entityId: number;
  /** 후보를 만든 결정론적 룰 */
  recallRule:
    | 'ALIAS_EXACT' | 'ALIAS_JAMO_SIMILAR' | 'ALIAS_PREFIX'
    | 'THEME_DICT' | 'GRAPH_EXPAND' | 'SUPPLY_DICT' | 'PERSON_DICT' | 'EMBEDDING';
  recallScore: number; // 0~1
  path: PathStep[];
  hopCount: number;
  evidence: Evidence[];
}

/** LLM 이 반환해야 하는 구조 (tool_use JSON schema 로 강제) */
export interface LlmJudgement {
  companyId: number;
  verdict: 'ACCEPT' | 'REJECT';
  connectionType: ConnectionKind;
  businessRelevance: Score100;
  meme: Score100;
  confidence: Score100;
  explanation: string;
  caution: string | null;
  /** 판단 근거로 삼은 path step index */
  usedPathSteps: number[];
}
