import type { GraphDto } from '@gukjang/spec';
import { describe, expect, it } from 'vitest';
import { layoutGraph } from './layout';

const graph: Pick<GraphDto, 'nodes' | 'edges'> = {
  nodes: [
    { id: -6, kind: 'NEWS', refId: 6, label: '뉴스', lane: 0 },
    { id: 1, kind: 'ENTITY', refId: 1, label: '태풍 노루', lane: 1 },
    { id: 2, kind: 'ENTITY', refId: 2, label: '노루', lane: 1 },
    { id: 3, kind: 'COMPANY', refId: 3, label: '노루페인트', ticker: '090350', lane: 3 },
  ],
  edges: [
    {
      id: 1,
      src: -6,
      dst: 1,
      type: 'MENTIONS',
      weight: 0.5,
      confidence: 0.5,
      label: '언급',
      evidence: null,
    },
    {
      id: 2,
      src: 1,
      dst: 2,
      type: 'MENTIONS',
      weight: 0.5,
      confidence: 0.5,
      label: '언급',
      evidence: null,
    },
    {
      id: 3,
      src: 2,
      dst: 3,
      type: 'NAME_MATCH',
      weight: 0.8,
      confidence: 0.8,
      label: '이름 일치',
      evidence: null,
    },
  ],
};

describe('layoutGraph', () => {
  it('모든 노드에 좌표를 부여한다', () => {
    const positions = layoutGraph(graph, { width: 800, height: 400 });
    expect(positions.size).toBe(4);
    for (const node of graph.nodes) {
      expect(positions.has(node.id)).toBe(true);
    }
  });

  it('레인 순서대로 x가 왼쪽에서 오른쪽으로 증가한다 (docs/05 S3 — 왼→오른쪽 흐름)', () => {
    const positions = layoutGraph(graph, { width: 800, height: 400 });
    const news = positions.get(-6)!;
    const entity = positions.get(1)!;
    const company = positions.get(3)!;
    expect(news.x).toBeLessThan(entity.x);
    expect(entity.x).toBeLessThan(company.x);
  });

  it('reducedMotion이면 시뮬레이션 없이 레인 안에서 균등 배치한다', () => {
    const positions = layoutGraph(graph, { width: 800, height: 400, reducedMotion: true });
    const entity1 = positions.get(1)!;
    const entity2 = positions.get(2)!;
    expect(entity1.x).toBe(entity2.x); // 같은 레인은 x가 같다
    expect(entity1.y).not.toBe(entity2.y); // 같은 레인 안에서 겹치지 않는다
  });

  it('같은 레인에 노드가 하나면 세로 중앙에 놓는다', () => {
    const positions = layoutGraph(graph, { width: 800, height: 400, reducedMotion: true });
    const news = positions.get(-6)!;
    expect(news.y).toBe(200);
  });

  it('좌표가 화면 범위 안에 있다', () => {
    const positions = layoutGraph(graph, { width: 800, height: 400 });
    for (const { x, y } of positions.values()) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(800);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(400);
    }
  });
});
