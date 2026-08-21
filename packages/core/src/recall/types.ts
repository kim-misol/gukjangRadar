/**
 * T2.3.1/2.3.2 — Recall 엔진 공용 타입. docs/09-prompt-company-matching.md §2 Recall 룰 8종.
 * 실제 DB IO(company_alias 스캔, 재귀 CTE 실행)는 apps/worker가 하고, 여기 정의된 타입은
 * 그 결과 행을 받아 후보로 해석하는 순수 함수들의 입출력 shape이다 (packages/core는 IO 없음).
 */
import type { AliasKind, EdgeKind, EdgeOrigin, Evidence, NodeKind, PathStep } from '@gukjang/spec';

export interface RecallBaseScores {
  ALIAS_EXACT: number;
  ALIAS_PREFIX: number;
  ALIAS_JAMO_SIMILAR_MIN: number;
  ALIAS_JAMO_SIMILAR_SPAN: number;
  THEME_DICT: number;
  SUPPLY_DICT: number;
  PERSON_DICT: number;
  GRAPH_EXPAND: number;
  EMBEDDING: number;
}

/** spec/scoring.config.json의 recall 섹션 shape. */
export interface RecallConfig {
  baseScoreByRule: RecallBaseScores;
  jamoSimilarityFloor: number;
  candidateCap: number;
  maxHops: number;
  pruneWeightFloor: number;
}

export type AliasRecallRule = 'ALIAS_EXACT' | 'ALIAS_PREFIX' | 'ALIAS_JAMO_SIMILAR';
export type GraphRecallRule = 'GRAPH_EXPAND' | 'SUPPLY_DICT' | 'THEME_DICT' | 'PERSON_DICT';

/** company_alias 조인 결과 한 행. */
export interface AliasRow {
  companyId: number;
  companyName: string;
  companyTicker: string;
  alias: string;
  aliasNorm: string;
  aliasType: AliasKind;
  isAmbiguous: boolean;
}

export interface AliasRecallHit {
  companyId: number;
  companyName: string;
  companyTicker: string;
  matchedAlias: string;
  aliasType: AliasKind;
  isAmbiguous: boolean;
  recallRule: AliasRecallRule;
  recallScore: number;
  isExactMatch: boolean;
}

/** concept 테이블 한 행 (THEME_DICT/SUPPLY_DICT 앵커 탐색용). */
export interface ConceptRow {
  id: number;
  nodeId: number;
  name: string;
  nameNorm: string;
}

export interface ConceptMatchHit {
  conceptId: number;
  conceptNodeId: number;
  conceptName: string;
}

/** graph_node/graph_edge 배치 조회 결과 — 재귀 CTE가 반환한 id들을 라벨·evidence로 해석할 때 쓴다. */
export interface GraphNodeRow {
  id: number;
  kind: NodeKind;
  refId: number;
  label: string;
}

export interface GraphEdgeRow {
  id: number;
  srcNodeId: number;
  dstNodeId: number;
  edgeType: EdgeKind;
  weight: number;
  confidence: number;
  origin: EdgeOrigin;
  evidence: Record<string, unknown>;
}

/** docs/11 §2-⑧ 재귀 CTE 한 행: 시작 노드에서 어떤 회사 노드까지 도달한 경로. */
export interface GraphWalkRow {
  companyId: number;
  hop: number;
  nodeIds: number[];
  edgeIds: number[];
  weightProduct: number;
}

export interface GraphWalkCandidate {
  companyId: number;
  recallRule: GraphRecallRule;
  recallScore: number;
  path: PathStep[];
  hopCount: number;
  evidence: Evidence[];
  /** 경로를 이룬 각 엣지의 confidence(0~1) — spec/types.ts Candidate.pathEdgeConfidences로 그대로 전달. */
  edgeConfidences: number[];
  /** 경로를 이룬 각 엣지의 weight(0~1) — spec/types.ts Candidate.pathEdgeWeights로 그대로 전달. */
  edgeWeights: number[];
}
