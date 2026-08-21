import { describe, expect, it } from 'vitest';
import { toNewsArticleInsertInput } from './map-article';

const source = { id: 1, name: '한국경제' };
const now = new Date('2026-08-21T09:00:00+09:00');

describe('toNewsArticleInsertInput', () => {
  it('정상 아이템을 insert 입력으로 변환한다', () => {
    const result = toNewsArticleInsertInput(
      {
        title: '[속보] 노루페인트 실적 발표 - 한국경제',
        link: 'https://hankyung.com/a/1',
        pubDate: '2026-08-21T08:00:00+09:00',
        description: '노루페인트가 3분기 실적을 발표했다.',
      },
      source,
      now,
    );

    expect(result).not.toBeNull();
    expect(result?.title).toBe('노루페인트 실적 발표');
    expect(result?.url).toBe('https://hankyung.com/a/1');
    expect(result?.sourceId).toBe(1);
    expect(result?.publishedAt).toEqual(new Date('2026-08-21T08:00:00+09:00'));
    expect(result?.lead).toBe('노루페인트가 3분기 실적을 발표했다.');
    expect(Number.isInteger(result?.simhash)).toBe(true);
  });

  it('링크의 트래킹 파라미터를 제거해 canonical url로 저장한다', () => {
    const result = toNewsArticleInsertInput(
      { title: '제목', link: 'https://hankyung.com/a/1?utm_source=naver&id=1', pubDate: null },
      source,
      now,
    );
    expect(result?.url).toBe('https://hankyung.com/a/1?id=1');
  });

  it('제목이 없으면 null', () => {
    const result = toNewsArticleInsertInput(
      { title: '', link: 'https://hankyung.com/a/1', pubDate: null },
      source,
      now,
    );
    expect(result).toBeNull();
  });

  it('링크가 없으면 null', () => {
    const result = toNewsArticleInsertInput(
      { title: '제목', link: '', pubDate: null },
      source,
      now,
    );
    expect(result).toBeNull();
  });

  it('pubDate가 없거나 파싱 불가하면 now로 대체한다', () => {
    const noDate = toNewsArticleInsertInput(
      { title: '제목', link: 'https://hankyung.com/a/1', pubDate: null },
      source,
      now,
    );
    expect(noDate?.publishedAt).toEqual(now);

    const badDate = toNewsArticleInsertInput(
      { title: '제목', link: 'https://hankyung.com/a/1', pubDate: '이상한 날짜' },
      source,
      now,
    );
    expect(badDate?.publishedAt).toEqual(now);
  });

  it('description이 200자를 넘으면 잘라낸다', () => {
    const longDesc = '가'.repeat(250);
    const result = toNewsArticleInsertInput(
      { title: '제목', link: 'https://hankyung.com/a/1', pubDate: null, description: longDesc },
      source,
      now,
    );
    expect(result?.lead).toHaveLength(200);
  });

  it('description의 HTML 태그를 제거한다', () => {
    const result = toNewsArticleInsertInput(
      {
        title: '제목',
        link: 'https://hankyung.com/a/1',
        pubDate: null,
        description: '<p>실적이 <b>급등</b>했다</p>',
      },
      source,
      now,
    );
    expect(result?.lead).toBe('실적이 급등했다');
  });

  it('description이 없으면 lead는 null', () => {
    const result = toNewsArticleInsertInput(
      { title: '제목', link: 'https://hankyung.com/a/1', pubDate: null },
      source,
      now,
    );
    expect(result?.lead).toBeNull();
  });
});
