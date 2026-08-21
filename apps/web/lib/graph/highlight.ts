import type { GraphDto } from '@gukjang/spec';

export interface HighlightSet {
  nodeIds: Set<number>;
  edgeIds: Set<number>;
}

/**
 * docs/05-screen-specs.md S3 — "노드 탭 → 해당 노드까지의 모든 경로 하이라이트".
 * 방향을 지켜서 조상(→선택 노드로 들어오는 방향)과 자손(선택 노드에서 나가는 방향)만 모은다.
 * 무방향으로 타고 다니면(이전 구현) 한 개체가 여러 회사로 갈라지는 허브 노드일 때, 회사 하나를
 * 고르면 형제 가지(다른 회사들)까지 전부 하이라이트되는 오류가 생긴다(W6 실 브라우저 검증에서
 * 발견 — docs/15 W6 기록 참고). 순수 함수, IO 없음.
 */
export function connectedNodeAndEdgeIds(
  graph: Pick<GraphDto, 'edges'>,
  nodeId: number,
): HighlightSet {
  const outgoing = new Map<number, { nodeId: number; edgeId: number }[]>();
  const incoming = new Map<number, { nodeId: number; edgeId: number }[]>();
  for (const e of graph.edges) {
    if (!outgoing.has(e.src)) outgoing.set(e.src, []);
    if (!incoming.has(e.dst)) incoming.set(e.dst, []);
    outgoing.get(e.src)!.push({ nodeId: e.dst, edgeId: e.id });
    incoming.get(e.dst)!.push({ nodeId: e.src, edgeId: e.id });
  }

  const nodeIds = new Set<number>([nodeId]);
  const edgeIds = new Set<number>();

  const walk = (start: number, adjacency: Map<number, { nodeId: number; edgeId: number }[]>) => {
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const { nodeId: neighborId, edgeId } of adjacency.get(current) ?? []) {
        edgeIds.add(edgeId);
        if (!nodeIds.has(neighborId)) {
          nodeIds.add(neighborId);
          queue.push(neighborId);
        }
      }
    }
  };

  walk(nodeId, incoming); // 조상 (선택 노드로 들어오는 경로)
  walk(nodeId, outgoing); // 자손 (선택 노드에서 나가는 경로)

  return { nodeIds, edgeIds };
}
