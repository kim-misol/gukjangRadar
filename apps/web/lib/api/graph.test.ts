import type { ConnectionDto } from '@gukjang/spec';
import { describe, expect, it } from 'vitest';
import { buildClusterGraph } from './graph';

function makeConnection(overrides: Partial<ConnectionDto> = {}): ConnectionDto {
  return {
    id: 1,
    clusterId: 6,
    company: { id: 3, ticker: '090350', name: '노루페인트', market: 'KOSPI', sector: '화학' },
    type: 'NAME_MATCH',
    scores: {
      businessRelevance: 20,
      keywordMatch: 60,
      supplyChain: 0,
      marketReaction: 0,
      meme: 39,
      confidence: 55,
      connection: 39,
    },
    relevanceBand: 'LOW',
    path: [
      { nodeId: 1, kind: 'ENTITY', label: '태풍 노루' },
      { nodeId: 2, kind: 'ENTITY', label: '노루', edgeType: 'MENTIONS', edgeLabel: '언급' },
      {
        nodeId: 3,
        kind: 'COMPANY',
        label: '노루페인트',
        edgeType: 'NAME_MATCH',
        edgeLabel: '이름 일치',
      },
    ],
    hopCount: 2,
    explanation: '표기가 유사합니다.',
    caution: null,
    counterEvidence: null,
    market: null,
    dataSources: [],
    status: 'ACTIVE',
    isMeme: false,
    ...overrides,
  };
}

const cluster = { id: 6, headline: "태풍 '노루' 북상" };

describe('buildClusterGraph', () => {
  it('뉴스 노드를 왼쪽에 두고 경로 첫 스텝까지 MENTIONS로 잇는다 (docs/05 S3)', () => {
    const graph = buildClusterGraph(cluster, [makeConnection()], []);
    const newsNode = graph.nodes.find((n) => n.kind === 'NEWS');
    expect(newsNode?.lane).toBe(0);
    expect(newsNode?.label).toBe(cluster.headline);

    const mentionsEdge = graph.edges.find((e) => e.type === 'MENTIONS');
    expect(mentionsEdge?.src).toBe(newsNode?.id);
    expect(mentionsEdge?.dst).toBe(1);
  });

  it('경로의 연속된 스텝마다 엣지를 만든다', () => {
    const graph = buildClusterGraph(cluster, [makeConnection()], []);
    // NEWS→태풍노루(MENTIONS) + 태풍노루→노루(MENTIONS) + 노루→노루페인트(NAME_MATCH)
    expect(graph.edges).toHaveLength(3);
    const nameMatch = graph.edges.find((e) => e.type === 'NAME_MATCH');
    expect(nameMatch?.src).toBe(2);
    expect(nameMatch?.dst).toBe(3);
  });

  it('COMPANY 노드에 티커를 채운다', () => {
    const graph = buildClusterGraph(cluster, [makeConnection()], []);
    const companyNode = graph.nodes.find((n) => n.kind === 'COMPANY');
    expect(companyNode?.ticker).toBe('090350');
  });

  it('entityIdByNodeId를 주면 ENTITY 노드 refId를 실제 entity.id로 채운다 (C9 개체 허브 링크용)', () => {
    const graph = buildClusterGraph(
      cluster,
      [makeConnection()],
      [],
      60,
      new Map([[2, 42]]), // graph_node.id=2("노루") → entity.id=42
    );
    const entityNode = graph.nodes.find((n) => n.id === 2);
    expect(entityNode?.refId).toBe(42);
  });

  it('entityIdByNodeId에 없는 ENTITY 노드는 그래프 노드 id로 근사한다 (기존 동작 유지)', () => {
    const graph = buildClusterGraph(cluster, [makeConnection()], []);
    const entityNode = graph.nodes.find((n) => n.id === 1);
    expect(entityNode?.refId).toBe(1);
  });

  it('실제 graph_edge 사실(weight/confidence/evidence)이 있으면 그대로 쓴다', () => {
    const graph = buildClusterGraph(
      cluster,
      [makeConnection()],
      [
        {
          srcNodeId: 2,
          dstNodeId: 3,
          edgeType: 'NAME_MATCH',
          weight: 0.9,
          confidence: 0.85,
          evidence: { source: 'RULE', label: '이름 일치' },
        },
      ],
    );
    const edge = graph.edges.find((e) => e.type === 'NAME_MATCH');
    expect(edge?.weight).toBe(0.9);
    expect(edge?.confidence).toBe(0.85);
    expect(edge?.evidence).toEqual({ source: 'RULE', label: '이름 일치' });
  });

  it('edgeType이 없는 스텝(CONCEPT_MATCH 등 룰 기반)도 끊지 않고 선을 잇는다', () => {
    const connection = makeConnection({
      path: [
        { nodeId: 10, kind: 'ENTITY', label: 'AI 가속기' },
        { nodeId: 1, kind: 'CONCEPT', label: 'AI가속기', edgeLabel: '개념 사전 매칭' },
        {
          nodeId: 2,
          kind: 'CONCEPT',
          label: 'HBM',
          edgeType: 'RELATED_CONCEPT',
          edgeLabel: '연관 개념',
        },
      ],
    });
    const graph = buildClusterGraph(cluster, [connection], []);
    const dictionaryHop = graph.edges.find((e) => e.src === 10 && e.dst === 1);
    expect(dictionaryHop).toBeDefined();
    expect(dictionaryHop?.label).toBe('개념 사전 매칭');
  });

  it('사실 정보가 없으면 기본값으로 채운다', () => {
    const graph = buildClusterGraph(cluster, [makeConnection()], []);
    const edge = graph.edges.find((e) => e.type === 'NAME_MATCH');
    expect(edge?.evidence).toBeNull();
  });

  it('여러 연결의 경로 노드를 중복 없이 합친다', () => {
    const other = makeConnection({
      id: 2,
      company: { id: 4, ticker: '000320', name: '노루홀딩스', market: 'KOSPI', sector: '기타금융' },
      path: [
        { nodeId: 1, kind: 'ENTITY', label: '태풍 노루' },
        {
          nodeId: 4,
          kind: 'COMPANY',
          label: '노루홀딩스',
          edgeType: 'NAME_MATCH',
          edgeLabel: '이름 일치',
        },
      ],
    });
    const graph = buildClusterGraph(cluster, [makeConnection(), other], []);
    // 노드: NEWS, 태풍노루(공유), 노루(1번 경로), 노루페인트, 노루홀딩스 = 5개
    expect(graph.nodes).toHaveLength(5);
  });

  it('경로가 빈 연결은 건너뛴다', () => {
    const graph = buildClusterGraph(cluster, [makeConnection({ path: [] })], []);
    expect(graph.nodes).toHaveLength(1); // NEWS 노드만
    expect(graph.edges).toHaveLength(0);
  });

  it('maxNodes를 초과하면 하위 연결부터 잘라내고 truncated=true를 반환한다', () => {
    const graph = buildClusterGraph(cluster, [makeConnection()], [], 3);
    expect(graph.truncated).toBe(true);
    expect(graph.nodes.length).toBeLessThanOrEqual(3);
  });

  it('textPaths는 헤드라인부터 시작하는 화살표 문자열이다', () => {
    const graph = buildClusterGraph(cluster, [makeConnection()], []);
    expect(graph.textPaths).toEqual(["태풍 '노루' 북상 → 태풍 노루 → 노루 → 노루페인트"]);
  });
});
