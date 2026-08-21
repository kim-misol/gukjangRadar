import { edgeTypeLabel } from '@gukjang/core';
import type {
  ConnectionDto,
  EdgeKind,
  Evidence,
  GraphDto,
  GraphEdgeDto,
  GraphNodeDto,
  NodeKind,
} from '@gukjang/spec';

const LANE: Record<NodeKind, 0 | 1 | 2 | 3> = { NEWS: 0, ENTITY: 1, CONCEPT: 2, COMPANY: 3 };

/** graph_edge 테이블에서 조회한 실제 weight/confidence/evidence — connection.path엔 없다. */
export interface EdgeFactRow {
  srcNodeId: number;
  dstNodeId: number;
  edgeType: EdgeKind;
  weight: number;
  confidence: number;
  evidence: Evidence | null;
}

function edgeKey(src: number, dst: number, type: EdgeKind): string {
  return `${src}:${dst}:${type}`;
}

/**
 * docs/05-screen-specs.md S3 — 뉴스 상세의 ConnectionGraph 데이터.
 * 그래프는 이 클러스터의 연결(connection.path)들을 그대로 합쳐 만든다 — 별도로 그래프를
 * 다시 탐색하지 않는다. "왜 발견됐나요"에 실제로 쓰인 근거만 보여준다는 R2/R3 원칙과 맞는다.
 * 뉴스 노드는 실 DB에 없을 수 있어(entity 추출이 LLM 의존, W6 시점엔 fixture 데이터라 없음)
 * 항상 이 함수에서 합성한다(음수 id로 실제 graph_node.id와 충돌 방지).
 * 순수 함수, IO 없음 — 실제 weight/confidence/evidence는 호출자가 `edgeFacts`로 주입한다.
 */
export function buildClusterGraph(
  cluster: { id: number; headline: string },
  connectionsSortedByScoreDesc: ConnectionDto[],
  edgeFacts: EdgeFactRow[],
  maxNodes = 60,
  entityIdByNodeId: ReadonlyMap<number, number> = new Map(),
): GraphDto {
  const edgeFactMap = new Map(
    edgeFacts.map((f) => [edgeKey(f.srcNodeId, f.dstNodeId, f.edgeType), f]),
  );
  const newsNodeId = -cluster.id;

  const nodes = new Map<number, GraphNodeDto>();
  nodes.set(newsNodeId, {
    id: newsNodeId,
    kind: 'NEWS',
    refId: cluster.id,
    label: cluster.headline,
    lane: 0,
  });

  const edges: GraphEdgeDto[] = [];
  const edgeSeen = new Set<string>();
  const textPaths: string[] = [];
  let edgeIdSeq = 1;
  let truncated = false;

  // CONCEPT는 connection.path에 concept.id가 없어(그래프 노드 id만 있음) refId를 정확히
  // 채울 수 없다 — 그래프 노드 id로 근사한다(V1.1 개념 허브가 생기면 ENTITY와 같은 방식으로
  // 고칠 것). ENTITY는 graph_node.ref_id가 그대로 entity.id라 entityIdByNodeId로 정확히
  // 채운다(V1.1 /entity/[entityId] 허브, docs/19 §3에서 실제로 이 값을 쓴다).
  const addNode = (
    step: { nodeId: number; kind: NodeKind; label: string },
    company?: { id: number; ticker: string },
  ) => {
    if (!nodes.has(step.nodeId)) {
      let refId = step.nodeId;
      if (step.kind === 'COMPANY' && company) refId = company.id;
      else if (step.kind === 'ENTITY') refId = entityIdByNodeId.get(step.nodeId) ?? step.nodeId;
      nodes.set(step.nodeId, {
        id: step.nodeId,
        kind: step.kind,
        refId,
        label: step.label,
        ticker: step.kind === 'COMPANY' ? company?.ticker : undefined,
        lane: LANE[step.kind],
      });
    }
  };

  const addEdge = (src: number, dst: number, type: EdgeKind, label: string) => {
    const key = edgeKey(src, dst, type);
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    const fact = edgeFactMap.get(key);
    edges.push({
      id: edgeIdSeq++,
      src,
      dst,
      type,
      weight: fact?.weight ?? 0.5,
      confidence: fact?.confidence ?? 0.5,
      label,
      evidence: fact?.evidence ?? null,
    });
  };

  for (const connection of connectionsSortedByScoreDesc) {
    const path = connection.path;
    if (path.length === 0) continue;

    const newNodeIds = path.filter((s) => !nodes.has(s.nodeId)).map((s) => s.nodeId);
    if (nodes.size + newNodeIds.length > maxNodes) {
      truncated = true;
      continue;
    }

    const first = path[0];
    if (!first) continue;
    addNode(first);
    addEdge(newsNodeId, first.nodeId, 'MENTIONS', edgeTypeLabel('MENTIONS'));

    path.forEach((step, i) => {
      const isLast = i === path.length - 1;
      addNode(step, isLast && step.kind === 'COMPANY' ? connection.company : undefined);
      const prev = i > 0 ? path[i - 1] : undefined;
      if (prev) {
        // CONCEPT_MATCH(개념 사전 매칭) 같은 룰 기반 스텝은 정식 graph_edge가 아니라
        // edgeType이 없다 — 그래도 경로의 일부이므로 RELATED_CONCEPT로 근사해 선을 그린다
        // (끊어서 보여주면 "왜 발견됐나요"가 끊긴 것처럼 보여 R2를 어긴다).
        addEdge(
          prev.nodeId,
          step.nodeId,
          step.edgeType ?? 'RELATED_CONCEPT',
          step.edgeLabel ?? (step.edgeType ? edgeTypeLabel(step.edgeType) : '연관'),
        );
      }
    });

    textPaths.push([cluster.headline, ...path.map((s) => s.label)].join(' → '));
  }

  return {
    clusterId: cluster.id,
    nodes: [...nodes.values()],
    edges,
    textPaths,
    truncated,
  };
}
