import { describe, expect, it, vi } from 'vitest';
import { RssClient } from './rss-client';

function textResponse(
  body: string,
  options: { ok?: boolean; status?: number; headers?: Record<string, string> } = {},
): Response {
  const { ok = true, status = 200, headers = {} } = options;
  return {
    ok,
    status,
    text: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>한국경제</title>
    <item>
      <title><![CDATA[[속보] 노루페인트 3분기 영업이익 급증]]></title>
      <link>https://hankyung.com/a/1</link>
      <pubDate>Fri, 21 Aug 2026 08:00:00 +0900</pubDate>
      <description><![CDATA[노루페인트가 3분기 영업이익을 발표했다.]]></description>
    </item>
    <item>
      <title>삼성전자 반도체 훈풍</title>
      <link>https://hankyung.com/a/2</link>
      <pubDate>Fri, 21 Aug 2026 09:00:00 +0900</pubDate>
    </item>
  </channel>
</rss>`;

const RSS_SINGLE_ITEM = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>단독 소스</title>
    <item>
      <title>단독 기사 제목</title>
      <link>https://example.com/a/1</link>
      <pubDate>Fri, 21 Aug 2026 08:00:00 +0900</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>조선비즈</title>
  <entry>
    <title>노루홀딩스 최대주주 지분 변동</title>
    <link href="https://biz.chosun.com/a/1" />
    <updated>2026-08-21T08:00:00+09:00</updated>
    <summary>노루홀딩스 지분 공시 내용.</summary>
  </entry>
</feed>`;

describe('RssClient.fetchFeed', () => {
  it('RSS 2.0 채널의 item 배열을 파싱한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(RSS_SAMPLE));
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.fetchFeed('https://hankyung.com/feed');

    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.title).toBe('[속보] 노루페인트 3분기 영업이익 급증');
    expect(result.items[0]?.link).toBe('https://hankyung.com/a/1');
    expect(result.items[0]?.pubDate).toBe('Fri, 21 Aug 2026 08:00:00 +0900');
    expect(result.items[0]?.description).toBe('노루페인트가 3분기 영업이익을 발표했다.');
    expect(result.items[1]?.description).toBeNull();
  });

  it('item이 하나뿐이어도 배열로 반환한다 (fast-xml-parser 단일요소 문제)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(RSS_SINGLE_ITEM));
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.fetchFeed('https://example.com/feed');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe('단독 기사 제목');
  });

  it('Atom 피드의 entry 배열을 파싱한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(ATOM_SAMPLE));
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await client.fetchFeed('https://biz.chosun.com/feed');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe('노루홀딩스 최대주주 지분 변동');
    expect(result.items[0]?.link).toBe('https://biz.chosun.com/a/1');
    expect(result.items[0]?.pubDate).toBe('2026-08-21T08:00:00+09:00');
  });

  it('응답 헤더의 ETag/Last-Modified를 반환한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      textResponse(RSS_SINGLE_ITEM, {
        headers: { etag: '"abc123"', 'last-modified': 'Fri, 21 Aug 2026 08:00:00 GMT' },
      }),
    );
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await client.fetchFeed('https://example.com/feed');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.etag).toBe('"abc123"');
    expect(result.lastModified).toBe('Fri, 21 Aug 2026 08:00:00 GMT');
  });

  it('ETag/Last-Modified를 넘기면 조건부 요청 헤더를 보낸다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(RSS_SINGLE_ITEM));
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.fetchFeed('https://example.com/feed', {
      etag: '"abc123"',
      lastModified: 'Fri, 21 Aug 2026 08:00:00 GMT',
    });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('"abc123"');
    expect(headers['If-Modified-Since']).toBe('Fri, 21 Aug 2026 08:00:00 GMT');
  });

  it('304 Not Modified면 파싱을 스킵하고 not_modified를 반환한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse('', { status: 304 }));
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await client.fetchFeed('https://example.com/feed', { etag: '"abc123"' });
    expect(result).toEqual({ status: 'not_modified' });
  });

  it('HTTP 오류 시 재시도 후 실패하면 던진다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse('', { ok: false, status: 500 }));
    const client = new RssClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 2,
      retryDelayMs: 1,
    });
    await expect(client.fetchFeed('https://hankyung.com/feed')).rejects.toThrow(
      /RSS 피드 수집 실패/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('일시 실패 후 재시도로 성공하면 결과를 반환한다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse('', { ok: false, status: 503 }))
      .mockResolvedValueOnce(textResponse(RSS_SINGLE_ITEM));
    const client = new RssClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 1,
    });
    const result = await client.fetchFeed('https://example.com/feed');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('인식할 수 없는 형식이면 에러', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse('<not-a-feed/>'));
    const client = new RssClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 0,
    });
    await expect(client.fetchFeed('https://example.com/feed')).rejects.toThrow();
  });
});

describe('RssClient.checkRobotsAllowed', () => {
  it('robots.txt에서 허용된 경로면 true', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse('User-agent: *\nDisallow: /admin'));
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await client.checkRobotsAllowed('https://example.com/rss/economy.xml')).toBe(true);
  });

  it('robots.txt에서 막힌 경로면 false', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse('User-agent: *\nDisallow: /rss/'));
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await client.checkRobotsAllowed('https://example.com/rss/economy.xml')).toBe(false);
  });

  it('robots.txt가 404면 전체 허용으로 간주한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse('', { ok: false, status: 404 }));
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await client.checkRobotsAllowed('https://example.com/rss/economy.xml')).toBe(true);
  });

  it('robots.txt 요청 자체가 실패해도 전체 허용으로 간주한다', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await client.checkRobotsAllowed('https://example.com/rss/economy.xml')).toBe(true);
  });

  it('올바른 origin/robots.txt 경로로 요청한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse('User-agent: *'));
    const client = new RssClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.checkRobotsAllowed('https://example.com/rss/economy.xml?x=1');
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/robots.txt', expect.anything());
  });
});
