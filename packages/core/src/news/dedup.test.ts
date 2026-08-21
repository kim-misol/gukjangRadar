import { describe, expect, it } from 'vitest';
import { pickDuplicateArticleIds } from './dedup';

describe('pickDuplicateArticleIds', () => {
  const t0 = new Date('2026-08-21T09:00:00+09:00');
  const t1 = new Date('2026-08-21T09:05:00+09:00');
  const t2 = new Date('2026-08-21T09:10:00+09:00');

  it('해밍거리가 가까운 것들 중 가장 먼저 발행된 것만 남기고 나머지를 중복으로 표시한다', () => {
    const articles = [
      { id: 1, simhash: 0b0000, publishedAt: t0 },
      { id: 2, simhash: 0b0001, publishedAt: t1 }, // 거리 1 → id1의 중복
      { id: 3, simhash: 0b0011, publishedAt: t2 }, // 거리 2(vs id1) → 중복
    ];
    expect(pickDuplicateArticleIds(articles, 3).sort()).toEqual([2, 3]);
  });

  it('해밍거리가 임계값을 넘으면 서로 다른 기사로 취급한다', () => {
    const articles = [
      { id: 1, simhash: 0x00000000, publishedAt: t0 },
      { id: 2, simhash: 0xffffffff, publishedAt: t1 },
    ];
    expect(pickDuplicateArticleIds(articles, 3)).toEqual([]);
  });

  it('simhash가 없는 기사는 비교 대상에서 빠진다', () => {
    const articles = [
      { id: 1, simhash: null, publishedAt: t0 },
      { id: 2, simhash: null, publishedAt: t1 },
    ];
    expect(pickDuplicateArticleIds(articles, 3)).toEqual([]);
  });

  it('발행 시각과 무관하게 입력 순서가 뒤바뀌어도 항상 가장 이른 기사를 남긴다', () => {
    const articles = [
      { id: 2, simhash: 0b0001, publishedAt: t1 },
      { id: 1, simhash: 0b0000, publishedAt: t0 },
    ];
    expect(pickDuplicateArticleIds(articles, 3)).toEqual([2]);
  });

  it('빈 배열이면 빈 배열', () => {
    expect(pickDuplicateArticleIds([], 3)).toEqual([]);
  });
});
