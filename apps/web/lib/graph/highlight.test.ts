import type { GraphDto } from '@gukjang/spec';
import { describe, expect, it } from 'vitest';
import { connectedNodeAndEdgeIds } from './highlight';

// NEWS(-6) → 태풍노루(1) → 노루(2) → 노루페인트(3)
//                              └─(2) 노루홀딩스(4)  (독립된 별도 클러스터라 가정 — 연결 안 됨)
const graph: Pick<GraphDto, 'edges'> = {
  edges: [
    {
      id: 1,
      src: -6,
      dst: 1,
      type: 'MENTIONS',
      weight: 0.5,
      confidence: 0.5,
      label: '',
      evidence: null,
    },
    {
      id: 2,
      src: 1,
      dst: 2,
      type: 'MENTIONS',
      weight: 0.5,
      confidence: 0.5,
      label: '',
      evidence: null,
    },
    {
      id: 3,
      src: 2,
      dst: 3,
      type: 'NAME_MATCH',
      weight: 0.8,
      confidence: 0.8,
      label: '',
      evidence: null,
    },
  ],
};

describe('connectedNodeAndEdgeIds', () => {
  it('선택한 노드에서 도달 가능한 모든 노드/엣지를 모은다', () => {
    const { nodeIds, edgeIds } = connectedNodeAndEdgeIds(graph, 2);
    expect(nodeIds).toEqual(new Set([2, -6, 1, 3]));
    expect(edgeIds).toEqual(new Set([1, 2, 3]));
  });

  it('말단 노드를 선택해도 전체 경로가 잡힌다', () => {
    const { nodeIds } = connectedNodeAndEdgeIds(graph, 3);
    expect(nodeIds).toEqual(new Set([3, 2, 1, -6]));
  });

  it('연결이 없는 노드는 자기 자신만 포함한다', () => {
    const { nodeIds, edgeIds } = connectedNodeAndEdgeIds(graph, 999);
    expect(nodeIds).toEqual(new Set([999]));
    expect(edgeIds.size).toBe(0);
  });

  describe('허브 노드에서 갈라지는 경우 (실 브라우저 검증에서 발견된 회귀)', () => {
    // NEWS(-1) → 원익홀딩스(10, ENTITY) → 원익홀딩스회사(20) / 노루홀딩스(21) / 원익IPS(22)
    const fanOut: Pick<GraphDto, 'edges'> = {
      edges: [
        {
          id: 1,
          src: -1,
          dst: 10,
          type: 'MENTIONS',
          weight: 0.5,
          confidence: 0.5,
          label: '',
          evidence: null,
        },
        {
          id: 2,
          src: 10,
          dst: 20,
          type: 'NAME_MATCH',
          weight: 0.9,
          confidence: 0.9,
          label: '',
          evidence: null,
        },
        {
          id: 3,
          src: 10,
          dst: 21,
          type: 'NAME_MATCH',
          weight: 0.5,
          confidence: 0.5,
          label: '',
          evidence: null,
        },
        {
          id: 4,
          src: 10,
          dst: 22,
          type: 'NAME_MATCH',
          weight: 0.5,
          confidence: 0.5,
          label: '',
          evidence: null,
        },
      ],
    };

    it('말단 회사 하나를 고르면 그 회사로 가는 경로만 잡히고 형제 가지는 빠진다', () => {
      const { nodeIds, edgeIds } = connectedNodeAndEdgeIds(fanOut, 21);
      expect(nodeIds).toEqual(new Set([21, 10, -1]));
      expect(edgeIds).toEqual(new Set([1, 3]));
    });

    it('공유 허브 노드를 고르면 갈라지는 모든 가지가 잡힌다', () => {
      const { nodeIds } = connectedNodeAndEdgeIds(fanOut, 10);
      expect(nodeIds).toEqual(new Set([10, -1, 20, 21, 22]));
    });
  });
});
