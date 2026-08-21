/**
 * T2.3.2 — 재귀 CTE 그래프 확장의 IO 부분 (docs/11-pipeline.md §2-⑧ SQL 그대로).
 * "사이클 방지"(NOT ... = ANY(nodes))와 "가지치기"(w >= floor) 둘 다 반드시 유지한다 —
 * 없으면 이 쿼리는 폭발한다(문서 경고 그대로).
 * 결과 해석(어떤 Recall 룰인지, PathStep을 어떻게 만드는지)은 packages/core/recall/graph-walk.ts가
 * 맡는다 — 여기는 순수하게 "SQL을 실행해 원시 행을 가져오는 것"까지만 한다.
 */
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { inArray, sql } from 'drizzle-orm';
import type { GraphEdgeRow, GraphNodeRow, GraphWalkRow } from '@gukjang/core';

// postgres.js는 bigint 컬럼(정밀도 손실 방지)을 기본적으로 문자열로 반환한다 — drizzle의
// 타입 있는 쿼리(bigserial mode:'number')와 달리 raw SQL은 이 변환을 대신 해주지 않는다.
// graph_node.id/graph_edge.id/company.id가 전부 bigint라 node_ids/edge_ids/company_id 모두
// 문자열(배열)로 온다 — 아래에서 명시적으로 숫자로 바꾸지 않으면 이후 Map 조회(number 키)가
// 전부 조용히 실패한다(문자열 '10' !== 숫자 10).
interface RawWalkRow {
  company_id: string;
  hop: number;
  node_ids: string[];
  edge_ids: string[];
  weight_product: string | number;
}

/** startNodeId에서 최대 maxHops까지 활성 엣지를 따라가 COMPANY 노드에 도달하는 모든 경로. */
export async function walkFromNode(
  db: ReturnType<typeof getDb>,
  startNodeId: number,
  maxHops: number,
  pruneWeightFloor: number,
  limit: number,
): Promise<GraphWalkRow[]> {
  const rows = (await db.execute(sql`
    WITH RECURSIVE walk AS (
      SELECT e.dst_node_id AS node_id, 1 AS hop,
             ARRAY[e.src_node_id, e.dst_node_id] AS nodes,
             ARRAY[e.id] AS edges, e.weight::numeric AS w
      FROM graph_edge e
      WHERE e.src_node_id = ${startNodeId} AND e.is_active
      UNION ALL
      SELECT e.dst_node_id, w.hop + 1,
             w.nodes || e.dst_node_id, w.edges || e.id, w.w * e.weight
      FROM walk w
      JOIN graph_edge e ON e.src_node_id = w.node_id AND e.is_active
      WHERE w.hop < ${maxHops}
        AND NOT e.dst_node_id = ANY(w.nodes)
        AND w.w * e.weight >= ${pruneWeightFloor}
    )
    SELECT n.ref_id AS company_id, w.hop AS hop, w.nodes AS node_ids, w.edges AS edge_ids,
           w.w AS weight_product
    FROM walk w JOIN graph_node n ON n.id = w.node_id
    WHERE n.kind = 'COMPANY'
    ORDER BY w.w DESC
    LIMIT ${limit};
  `)) as unknown as RawWalkRow[];

  return rows.map((r) => ({
    companyId: Number(r.company_id),
    hop: r.hop,
    nodeIds: r.node_ids.map(Number),
    edgeIds: r.edge_ids.map(Number),
    weightProduct: Number(r.weight_product),
  }));
}

/** walkFromNode가 반환한 node/edge id를 라벨·evidence로 해석하기 위한 배치 조회. */
export async function fetchNodesAndEdges(
  db: ReturnType<typeof getDb>,
  nodeIds: readonly number[],
  edgeIds: readonly number[],
): Promise<{ nodeById: Map<number, GraphNodeRow>; edgeById: Map<number, GraphEdgeRow> }> {
  const nodeById = new Map<number, GraphNodeRow>();
  const edgeById = new Map<number, GraphEdgeRow>();
  if (nodeIds.length === 0 && edgeIds.length === 0) return { nodeById, edgeById };

  if (nodeIds.length > 0) {
    const nodes = await db
      .select({
        id: schema.graphNode.id,
        kind: schema.graphNode.kind,
        refId: schema.graphNode.refId,
        label: schema.graphNode.label,
      })
      .from(schema.graphNode)
      .where(inArray(schema.graphNode.id, [...nodeIds]));
    for (const n of nodes) nodeById.set(n.id, n);
  }

  if (edgeIds.length > 0) {
    const edges = await db
      .select({
        id: schema.graphEdge.id,
        srcNodeId: schema.graphEdge.srcNodeId,
        dstNodeId: schema.graphEdge.dstNodeId,
        edgeType: schema.graphEdge.edgeType,
        weight: schema.graphEdge.weight,
        confidence: schema.graphEdge.confidence,
        origin: schema.graphEdge.origin,
        evidence: schema.graphEdge.evidence,
      })
      .from(schema.graphEdge)
      .where(inArray(schema.graphEdge.id, [...edgeIds]));
    for (const e of edges) {
      edgeById.set(e.id, {
        id: e.id,
        srcNodeId: e.srcNodeId,
        dstNodeId: e.dstNodeId,
        edgeType: e.edgeType,
        weight: Number(e.weight),
        confidence: Number(e.confidence),
        origin: e.origin,
        evidence: e.evidence as Record<string, unknown>,
      });
    }
  }

  return { nodeById, edgeById };
}
