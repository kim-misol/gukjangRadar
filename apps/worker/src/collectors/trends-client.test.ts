import { describe, expect, it, vi } from 'vitest';
import { TrendsClient } from './trends-client';

function textResponse(body: string, ok = true, status = 200): Response {
  return { ok, status, text: async () => body } as Response;
}

// 2026-08-21 실 네트워크로 https://trends.google.com/trending/rss?geo=KR 에서 직접 확인한
// 실제 응답 구조를 축약한 fixture (본문 앞부분 2개 item, 각 item의 news_item 1~2개).
const TRENDS_SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:ht="https://trends.google.com/trending/rss" version="2.0">
  <channel>
    <title>Daily Search Trends</title>
    <item>
      <title>택시</title>
      <ht:approx_traffic>2000+</ht:approx_traffic>
      <description/>
      <link>https://trends.google.com/trending/rss?geo=KR</link>
      <pubDate>Thu, 20 Aug 2026 16:00:00 -0700</pubDate>
      <ht:news_item>
        <ht:news_item_title>&#8216;택시 기다리는 건 옛말&#8217; 99.4% 지역서 카카오T 등 수요응답형 택시 달린다</ht:news_item_title>
        <ht:news_item_snippet/>
        <ht:news_item_url>https://v.daum.net/v/20260821060217561</ht:news_item_url>
        <ht:news_item_source>Daum</ht:news_item_source>
      </ht:news_item>
      <ht:news_item>
        <ht:news_item_title>&quot;플랫폼 택시, 국내 첨단모빌리티 중 도입률·만족도 1위&quot;</ht:news_item_title>
        <ht:news_item_snippet/>
        <ht:news_item_url>https://www.yna.co.kr/view/AKR20260820151600003</ht:news_item_url>
        <ht:news_item_source>연합뉴스</ht:news_item_source>
      </ht:news_item>
    </item>
    <item>
      <title>선우용여</title>
      <ht:approx_traffic>1000+</ht:approx_traffic>
      <description/>
      <link>https://trends.google.com/trending/rss?geo=KR</link>
      <pubDate>Thu, 20 Aug 2026 15:50:00 -0700</pubDate>
      <ht:news_item>
        <ht:news_item_title>선우용여, 美 사돈댁 포드 주주였다</ht:news_item_title>
        <ht:news_item_snippet/>
        <ht:news_item_url>https://example.com/a</ht:news_item_url>
        <ht:news_item_source>뉴시스</ht:news_item_source>
      </ht:news_item>
    </item>
  </channel>
</rss>`;

const TRENDS_SINGLE_ITEM_SINGLE_NEWS = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0">
  <channel>
    <item>
      <title>단독 급상승어</title>
      <ht:approx_traffic>500+</ht:approx_traffic>
      <pubDate>Thu, 20 Aug 2026 15:00:00 -0700</pubDate>
      <ht:news_item>
        <ht:news_item_title>기사 하나</ht:news_item_title>
        <ht:news_item_url>https://example.com/only</ht:news_item_url>
        <ht:news_item_source>테스트매체</ht:news_item_source>
      </ht:news_item>
    </item>
  </channel>
</rss>`;

describe('TrendsClient', () => {
  it('실 응답 구조에서 급상승 검색어와 관련 기사를 파싱한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(TRENDS_SAMPLE));
    const client = new TrendsClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const topics = await client.fetchTrending('KR');

    expect(topics).toHaveLength(2);
    expect(topics[0]?.title).toBe('택시');
    expect(topics[0]?.approxTraffic).toBe('2000+');
    expect(topics[0]?.newsItems).toHaveLength(2);
    expect(topics[0]?.newsItems[0]?.source).toBe('Daum');
    expect(topics[0]?.newsItems[1]?.source).toBe('연합뉴스');
    expect(topics[1]?.title).toBe('선우용여');
  });

  it('geo 파라미터를 쿼리에 반영한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(TRENDS_SAMPLE));
    const client = new TrendsClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.fetchTrending('US');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://trends.google.com/trending/rss?geo=US');
  });

  it('item/news_item이 하나뿐이어도 배열로 반환한다 (fast-xml-parser 단일요소 문제)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse(TRENDS_SINGLE_ITEM_SINGLE_NEWS));
    const client = new TrendsClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const topics = await client.fetchTrending();
    expect(topics).toHaveLength(1);
    expect(topics[0]?.newsItems).toHaveLength(1);
    expect(topics[0]?.newsItems[0]?.url).toBe('https://example.com/only');
  });

  it('HTTP 오류 시 재시도 후 실패하면 던진다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse('', false, 500));
    const client = new TrendsClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 1,
      retryDelayMs: 1,
    });
    await expect(client.fetchTrending()).rejects.toThrow(/Google Trends 수집 실패/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('인식할 수 없는 형식이면 에러', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(textResponse('<not-a-feed/>'));
    const client = new TrendsClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 0,
    });
    await expect(client.fetchTrending()).rejects.toThrow();
  });
});
