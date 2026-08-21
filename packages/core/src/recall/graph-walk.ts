/**
 * T2.3.2 — 재귀 CTE(docs/11-pipeline.md §2-⑧) 결과 해석.
 * SQL은 노드/엣지 id 배열만 반환한다(§2-⑧ 그대로) — "이 경로가 어떤 Recall 룰인가"와
 * "PathStep[]/evidence를 어떻게 만드는가"는 순수 함수인 이 모듈이 맡는다 (R7).
 *
 * 룰 분류(경로에 등장한 엣지 타입 기준, docs/09 §2):
 *   SUPPLY_CHAIN 엣지 포함           → SUPPLY_DICT
 *   PERSON_OF 엣지 포함              → PERSON_DICT
 *   AFFILIATION 엣지로만 구성        → GRAPH_EXPAND ("확정된 기업에서 AFFILIATION 1홉")
 *   그 외(BELONGS_TO/RELATED_CONCEPT 등) → THEME_DICT
 */
import type { Candidate, Evidence, PathStep } from '@gukjang/spec';
import { edgeTypeLabel } from './edge-label';
import type {
  GraphEdgeRow,
  GraphNodeRow,
  GraphRecallRule,
  GraphWalkCandidate,
  GraphWalkRow,
  RecallConfig,
} from './types';

function classifyRule(edges: readonly GraphEdgeRow[]): GraphRecallRule {
  if (edges.some((e) => e.edgeType === 'SUPPLY_CHAIN')) return 'SUPPLY_DICT';
  if (edges.some((e) => e.edgeType === 'PERSON_OF')) return 'PERSON_DICT';
  if (edges.every((e) => e.edgeType === 'AFFILIATION')) return 'GRAPH_EXPAND';
  return 'THEME_DICT';
}

function buildEvidence(edge: GraphEdgeRow, fromLabel: string, toLabel: string): Evidence {
  const url = edge.evidence.url;
  const docNo = edge.evidence.doc_no;
  return {
    rule: edge.edgeType,
    source: edge.origin,
    label: `${fromLabel} → ${toLabel} (${edgeTypeLabel(edge.edgeType)})`,
    url: typeof url === 'string' ? url : undefined,
    docNo: typeof docNo === 'string' ? docNo : undefined,
  };
}

export function buildGraphWalkCandidates(
  walkRows: readonly GraphWalkRow[],
  nodeById: ReadonlyMap<number, GraphNodeRow>,
  edgeById: ReadonlyMap<number, GraphEdgeRow>,
  cfg: RecallConfig,
): GraphWalkCandidate[] {
  const candidates: GraphWalkCandidate[] = [];

  for (const walk of walkRows) {
    const nodes = walk.nodeIds.map((id) => nodeById.get(id));
    const edges = walk.edgeIds.map((id) => edgeById.get(id));
    if (nodes.some((n) => !n) || edges.some((e) => !e)) continue; // 배치 조회 누락분은 건너뛴다
    const resolvedNodes = nodes as GraphNodeRow[];
    const resolvedEdges = edges as GraphEdgeRow[];

    const rule = classifyRule(resolvedEdges);
    const path: PathStep[] = resolvedNodes.map((node, i) => {
      const edge = resolvedEdges[i - 1];
      return {
        nodeId: node.id,
        kind: node.kind,
        label: node.label,
        edgeType: edge?.edgeType,
        edgeLabel: edge ? edgeTypeLabel(edge.edgeType) : undefined,
      };
    });

    const evidence = resolvedEdges.map((edge, i) => {
      const fromLabel = resolvedNodes[i]?.label ?? '';
      const toLabel = resolvedNodes[i + 1]?.label ?? '';
      return buildEvidence(edge, fromLabel, toLabel);
    });

    candidates.push({
      companyId: walk.companyId,
      recallRule: rule,
      recallScore: Math.min(1, cfg.baseScoreByRule[rule] * walk.weightProduct),
      path,
      hopCount: walk.hop,
      evidence,
      edgeConfidences: resolvedEdges.map((e) => e.confidence),
      edgeWeights: resolvedEdges.map((e) => e.weight),
    });
  }

  return candidates;
}

export function toCandidateFromGraphWalk(
  walk: GraphWalkCandidate,
  entityId: number,
  ticker: string,
  name: string,
): Candidate {
  return {
    companyId: walk.companyId,
    ticker,
    name,
    entityId,
    recallRule: walk.recallRule,
    recallScore: walk.recallScore,
    path: walk.path,
    hopCount: walk.hopCount,
    evidence: walk.evidence,
    keywordMatchScore: 0,
    isAmbiguousAlias: false,
    pathEdgeConfidences: walk.edgeConfidences,
    pathEdgeWeights: walk.edgeWeights,
  };
}
