import {
  forceCollide,
  forceLink,
  forceSimulation,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force';
import type { GraphDto } from '@gukjang/spec';

export interface Point {
  x: number;
  y: number;
}

interface SimNode extends SimulationNodeDatum {
  id: number;
}

/**
 * docs/05-screen-specs.md S3 — 좌→우 4레인 배치. 레인(x)은 고정하고 세로(y)만 d3-force로
 * 겹치지 않게 배치한다. `reducedMotion`이면 시뮬레이션 없이 레인 안에서 균등 배치한다
 * (prefers-reduced-motion 접근성 요구사항).
 * 순수 함수, IO 없음 — 애니메이션 루프 없이 고정 tick 수만큼 미리 계산해 최종 좌표만 반환한다.
 */
export function layoutGraph(
  graph: Pick<GraphDto, 'nodes' | 'edges'>,
  opts: { width: number; height: number; laneCount?: number; reducedMotion?: boolean },
): Map<number, Point> {
  const { width, height } = opts;
  const laneCount = opts.laneCount ?? 4;
  const laneWidth = width / laneCount;
  const padding = 36;

  const nodesByLane = new Map<number, GraphDto['nodes']>();
  for (const n of graph.nodes) {
    const list = nodesByLane.get(n.lane) ?? [];
    list.push(n);
    nodesByLane.set(n.lane, list);
  }

  const initialY = new Map<number, number>();
  const laneX = new Map<number, number>();
  for (const [lane, nodes] of nodesByLane) {
    const x = lane * laneWidth + laneWidth / 2;
    laneX.set(lane, x);
    nodes.forEach((n, i) => {
      const y =
        nodes.length === 1
          ? height / 2
          : padding + (i * (height - 2 * padding)) / (nodes.length - 1);
      initialY.set(n.id, y);
    });
  }

  if (opts.reducedMotion) {
    const result = new Map<number, Point>();
    for (const n of graph.nodes) {
      result.set(n.id, { x: laneX.get(n.lane) ?? width / 2, y: initialY.get(n.id) ?? height / 2 });
    }
    return result;
  }

  const simNodes: SimNode[] = graph.nodes.map((n) => ({
    id: n.id,
    x: laneX.get(n.lane),
    y: initialY.get(n.id),
    fx: laneX.get(n.lane),
  }));
  const simLinks = graph.edges.map((e) => ({ source: e.src, target: e.dst }));

  const simulation = forceSimulation(simNodes)
    .force('y', forceY<SimNode>((d) => initialY.get(d.id) ?? height / 2).strength(0.25))
    .force('collide', forceCollide<SimNode>(26))
    .force(
      'link',
      forceLink<SimNode, { source: number; target: number }>(simLinks)
        .id((d) => d.id)
        .distance(laneWidth * 0.9)
        .strength(0.15),
    )
    .stop();

  for (let i = 0; i < 200; i++) simulation.tick();

  const result = new Map<number, Point>();
  for (const n of simNodes) {
    const y = n.y ?? height / 2;
    result.set(n.id, { x: n.x ?? width / 2, y: Math.max(padding, Math.min(height - padding, y)) });
  }
  return result;
}
