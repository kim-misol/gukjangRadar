import { describe, expect, it } from 'vitest';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type { GraphEdgeRow, GraphNodeRow, GraphWalkRow, RecallConfig } from './types';
import { buildGraphWalkCandidates, toCandidateFromGraphWalk } from './graph-walk';

const cfg = scoringConfig.recall as RecallConfig;

// 개념 노드 "AI가속기"(1) -[RELATED_CONCEPT]-> "HBM"(2) -[SUPPLY_CHAIN]-> 회사 "SK하이닉스"(3)
const nodeById = new Map<number, GraphNodeRow>([
  [1, { id: 1, kind: 'CONCEPT', refId: 10, label: 'AI가속기' }],
  [2, { id: 2, kind: 'CONCEPT', refId: 11, label: 'HBM' }],
  [3, { id: 3, kind: 'COMPANY', refId: 660, label: 'SK하이닉스' }],
]);
const edgeById = new Map<number, GraphEdgeRow>([
  [
    100,
    {
      id: 100,
      srcNodeId: 1,
      dstNodeId: 2,
      edgeType: 'RELATED_CONCEPT',
      weight: 0.9,
      confidence: 0.9,
      origin: 'DICTIONARY',
      evidence: {},
    },
  ],
  [
    101,
    {
      id: 101,
      srcNodeId: 2,
      dstNodeId: 3,
      edgeType: 'SUPPLY_CHAIN',
      weight: 0.85,
      confidence: 0.85,
      origin: 'DICTIONARY',
      evidence: { doc_no: 'SUPPLY-001' },
    },
  ],
]);

describe('buildGraphWalkCandidates', () => {
  it('경로에 SUPPLY_CHAIN 엣지가 있으면 SUPPLY_DICT로 분류한다', () => {
    const walk: GraphWalkRow = {
      companyId: 660,
      hop: 2,
      nodeIds: [1, 2, 3],
      edgeIds: [100, 101],
      weightProduct: 0.9 * 0.85,
    };
    const [candidate] = buildGraphWalkCandidates([walk], nodeById, edgeById, cfg);
    expect(candidate?.recallRule).toBe('SUPPLY_DICT');
    expect(candidate?.hopCount).toBe(2);
    expect(candidate?.path).toHaveLength(3);
    expect(candidate?.path[0]?.edgeType).toBeUndefined(); // 첫 스텝은 엣지 없음
    expect(candidate?.path[2]?.edgeType).toBe('SUPPLY_CHAIN');
    expect(candidate?.evidence).toHaveLength(2);
    expect(candidate?.evidence[1]?.docNo).toBe('SUPPLY-001');
    expect(candidate?.recallScore).toBeCloseTo(cfg.baseScoreByRule.SUPPLY_DICT * 0.9 * 0.85, 5);
    expect(candidate?.edgeConfidences).toEqual([0.9, 0.85]);
    expect(candidate?.edgeWeights).toEqual([0.9, 0.85]);
  });

  it('AFFILIATION 엣지로만 구성된 경로는 GRAPH_EXPAND로 분류한다', () => {
    const affNodeById = new Map<number, GraphNodeRow>([
      [3, { id: 3, kind: 'COMPANY', refId: 90350, label: '노루페인트' }],
      [4, { id: 4, kind: 'COMPANY', refId: 320, label: '노루홀딩스' }],
    ]);
    const affEdgeById = new Map<number, GraphEdgeRow>([
      [
        200,
        {
          id: 200,
          srcNodeId: 3,
          dstNodeId: 4,
          edgeType: 'AFFILIATION',
          weight: 0.8,
          confidence: 0.9,
          origin: 'DART',
          evidence: {},
        },
      ],
    ]);
    const walk: GraphWalkRow = {
      companyId: 320,
      hop: 1,
      nodeIds: [3, 4],
      edgeIds: [200],
      weightProduct: 0.8,
    };
    const [candidate] = buildGraphWalkCandidates([walk], affNodeById, affEdgeById, cfg);
    expect(candidate?.recallRule).toBe('GRAPH_EXPAND');
  });

  it('배치 조회에서 누락된 노드/엣지가 있으면 해당 walk는 건너뛴다', () => {
    const walk: GraphWalkRow = {
      companyId: 999,
      hop: 1,
      nodeIds: [1, 999],
      edgeIds: [100],
      weightProduct: 0.5,
    };
    const candidates = buildGraphWalkCandidates([walk], nodeById, edgeById, cfg);
    expect(candidates).toHaveLength(0);
  });
});

describe('toCandidateFromGraphWalk', () => {
  it('entityId/ticker/name을 채워 Candidate로 변환한다', () => {
    const walk: GraphWalkRow = {
      companyId: 660,
      hop: 2,
      nodeIds: [1, 2, 3],
      edgeIds: [100, 101],
      weightProduct: 0.9 * 0.85,
    };
    const [walkCandidate] = buildGraphWalkCandidates([walk], nodeById, edgeById, cfg);
    const candidate = toCandidateFromGraphWalk(walkCandidate!, 42, '000660', 'SK하이닉스');
    expect(candidate.entityId).toBe(42);
    expect(candidate.ticker).toBe('000660');
    expect(candidate.companyId).toBe(660);
  });
});
