import { describe, expect, it } from 'vitest';
import { cosineSimilarity, findMatchingCluster, isBetterRepresentative } from './cluster';
import { tokenizeForClustering } from './title-normalize';
import type { ClusterCandidate } from './types';

describe('cosineSimilarity', () => {
  it('동일 벡터는 1', () => {
    expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1);
  });

  it('직교 벡터는 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('차원이 다르면 0', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });

  it('영벡터가 섞이면 0', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('findMatchingCluster', () => {
  const now = new Date('2026-08-21T10:00:00+09:00');

  function candidate(overrides: Partial<ClusterCandidate>): ClusterCandidate {
    return {
      id: 1,
      tokens: tokenizeForClustering('노루페인트 실적 발표'),
      lastSeenAt: now,
      ...overrides,
    };
  }

  it('자카드 임계값을 넘는 후보 중 가장 높은 것을 고른다 (같은 사건, 다른 매체 표현)', () => {
    // jaccard('노루페인트, 3분기 영업이익 급증', '노루페인트 3분기 영업이익 20% 증가') ≈ 0.65
    const strongMatch = candidate({
      id: 1,
      tokens: tokenizeForClustering('노루페인트, 3분기 영업이익 급증'),
    });
    const weakMatch = candidate({ id: 2, tokens: tokenizeForClustering('완전히 다른 뉴스 제목') });
    const articleTokens = tokenizeForClustering('노루페인트 3분기 영업이익 20% 증가');

    const result = findMatchingCluster(articleTokens, now, [weakMatch, strongMatch], null);
    expect(result).toBe(1);
  });

  it('임계값 미만이면 null (새 클러스터 필요)', () => {
    const unrelated = candidate({
      id: 1,
      tokens: tokenizeForClustering('제주도 폭설 항공편 결항'),
    });
    const articleTokens = tokenizeForClustering('삼성전자 3분기 실적 서프라이즈');

    expect(findMatchingCluster(articleTokens, now, [unrelated], null)).toBeNull();
  });

  it('24시간 창을 벗어난 클러스터는 후보에서 제외한다', () => {
    const tokens = tokenizeForClustering('노루페인트 실적 발표');
    const stale = candidate({
      id: 1,
      tokens,
      lastSeenAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
    });
    expect(findMatchingCluster(tokens, now, [stale], null)).toBeNull();
  });

  it('둘 다 임베딩이 있으면 코사인 2차 검사까지 통과해야 매칭된다', () => {
    const tokens = tokenizeForClustering('노루페인트 실적 발표');
    const lowCosine = candidate({ id: 1, tokens, embedding: [1, 0] });
    const result = findMatchingCluster(tokens, now, [lowCosine], [0, 1], {
      cosineThreshold: 0.88,
    });
    expect(result).toBeNull();
  });

  it('한쪽에만 임베딩이 있으면 1차(자카드) 결과만으로 판정한다', () => {
    const tokens = tokenizeForClustering('노루페인트 실적 발표');
    const noEmbedding = candidate({ id: 1, tokens });
    expect(findMatchingCluster(tokens, now, [noEmbedding], [0, 1])).toBe(1);
  });

  it('후보가 없으면 null', () => {
    const tokens = tokenizeForClustering('노루페인트 실적 발표');
    expect(findMatchingCluster(tokens, now, [], null)).toBeNull();
  });
});

describe('isBetterRepresentative', () => {
  const t1 = new Date('2026-08-21T09:00:00+09:00');
  const t2 = new Date('2026-08-21T10:00:00+09:00');

  it('tier가 더 낮은(신뢰도 높은) 쪽이 이긴다', () => {
    expect(
      isBetterRepresentative(
        { sourceTier: 1, publishedAt: t2 },
        { sourceTier: 2, publishedAt: t1 },
      ),
    ).toBe(true);
  });

  it('같은 tier면 먼저 발행된 쪽이 이긴다', () => {
    expect(
      isBetterRepresentative(
        { sourceTier: 1, publishedAt: t1 },
        { sourceTier: 1, publishedAt: t2 },
      ),
    ).toBe(true);
  });

  it('현재가 이미 더 나으면 false', () => {
    expect(
      isBetterRepresentative(
        { sourceTier: 2, publishedAt: t1 },
        { sourceTier: 1, publishedAt: t2 },
      ),
    ).toBe(false);
  });
});
