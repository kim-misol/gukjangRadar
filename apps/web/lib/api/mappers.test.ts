import type { ConnectionDto } from '@gukjang/spec';
import { describe, expect, it } from 'vitest';
import {
  toConnectionDto,
  toMarketReaction,
  toMemeRankItem,
  toNewsClusterDto,
  type ConnectionRow,
} from './mappers';

const baseConnectionRow: ConnectionRow = {
  id: 2,
  clusterId: 6,
  connectionType: 'MEME',
  businessRelevanceScore: 20,
  keywordMatchScore: 60,
  supplyChainScore: 0,
  marketReactionScore: 10,
  memeScore: 39,
  confidenceScore: 55,
  connectionScore: 39,
  relevanceBand: 'LOW',
  path: [
    { nodeId: 1, kind: 'ENTITY', label: '태풍 노루' },
    {
      nodeId: 2,
      kind: 'COMPANY',
      label: '노루페인트',
      edgeType: 'NAME_MATCH',
      edgeLabel: '이름 일치',
    },
  ],
  hopCount: 1,
  explanation: '이름이 비슷해 화제가 되고 있습니다.',
  caution: null,
  counterEvidence: null,
  dataSources: [{ source: 'RULE', label: '이름 일치' }],
  status: 'ACTIVE',
  company: { id: 3, ticker: '090350', name: '노루페인트', market: 'KOSPI', sector: '화학' },
  market: null,
};

describe('toConnectionDto', () => {
  it('DB 행을 ConnectionDto로 변환한다', () => {
    const dto = toConnectionDto(baseConnectionRow);
    expect(dto.scores.connection).toBe(39);
    expect(dto.path).toHaveLength(2);
    expect(dto.company.name).toBe('노루페인트');
  });

  it('connection_type=MEME이면 isMeme=true다', () => {
    expect(toConnectionDto(baseConnectionRow).isMeme).toBe(true);
  });

  it('path/dataSources가 없으면 빈 배열로 채운다', () => {
    const dto = toConnectionDto({ ...baseConnectionRow, path: null, dataSources: null });
    expect(dto.path).toEqual([]);
    expect(dto.dataSources).toEqual([]);
  });
});

describe('toNewsClusterDto', () => {
  it('상위 연결 경로를 최대 2개까지 pathPreviews로 만든다', () => {
    const connection = toConnectionDto(baseConnectionRow);
    const dto = toNewsClusterDto(
      {
        id: 6,
        headline: "태풍 '노루' 북상",
        emoji: '🌀',
        aiSummary: null,
        tradeDate: '2026-08-21',
        firstSeenAt: new Date('2026-08-21T09:00:00Z'),
        articleCount: 5,
        heatScore: 42,
        analysisStatus: 'DONE',
        representativeUrl: 'https://example.com/a',
      },
      [{ name: '연합뉴스', url: 'https://example.com/a' }],
      [],
      [connection, connection, connection],
    );
    expect(dto.pathPreviews).toEqual(['태풍 노루 → 노루페인트', '태풍 노루 → 노루페인트']);
  });
});

describe('toMemeRankItem', () => {
  it('경로 첫 스텝과 회사명으로 arrowLabel을 만든다', () => {
    const connection: ConnectionDto = toConnectionDto(baseConnectionRow);
    const item = toMemeRankItem(connection, 1);
    expect(item.arrowLabel).toBe('태풍 노루 → 노루페인트');
    expect(item.rank).toBe(1);
    expect(item.shareImageUrl).toBe('/api/og/connection/2');
  });
});

describe('toMarketReaction', () => {
  it('postgres.js가 문자열로 반환하는 numeric 컬럼을 숫자로 바꾼다', () => {
    const reaction = toMarketReaction({
      capturedAt: new Date('2026-08-21T06:00:00Z'),
      isDelayed: true,
      price: 68000,
      changePct: '1.25',
      volume: '1234567',
      volumeRatio20: '1.83',
    });
    expect(reaction.changePct).toBe(1.25);
    expect(reaction.volume).toBe(1234567);
    expect(reaction.volumeRatio20).toBe(1.83);
  });

  it('null 값은 null로 유지한다', () => {
    const reaction = toMarketReaction({
      capturedAt: new Date('2026-08-21T06:00:00Z'),
      isDelayed: true,
      price: null,
      changePct: null,
      volume: null,
      volumeRatio20: null,
    });
    expect(reaction.changePct).toBeNull();
    expect(reaction.volume).toBeNull();
  });
});
