/**
 * B-1층 — Google Trends KR 급상승 검색어 (docs/16-news-sources.md §2-B-1).
 * `GET https://trends.google.com/trending/rss?geo=KR` — 인증 불필요, 비공식 피드.
 *
 * 실제 응답 구조(2026-08-21 이 코드 작성 중 실 네트워크로 직접 확인):
 * item.title(검색어), item['ht:approx_traffic'], item['ht:news_item'](배열, 각각
 * ht:news_item_title/url/source). 비공식 피드라 형식이 바뀔 수 있어 방어적으로 파싱하고,
 * 실패해도 A층(RssClient) 수집에 영향이 없도록 별도 클라이언트로 분리해 뒀다.
 *
 * NOTE: 이 클라이언트는 fetch+파싱까지만 구현한다. "급상승 검색어 → entity 후보 →
 * 후보 검색(⑧)" 연결은 W4/W5의 개체 추출·후보 검색 파이프라인이 갖춰진 뒤에나 의미가
 * 있는 스키마/제품 결정이라 T2.1.1 범위에서는 저장 대상을 아직 정하지 않았다 —
 * docs/15-build-order.md W3 진행 기록 참고.
 */
import { XMLParser } from 'fast-xml-parser';

export interface TrendsClientOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface TrendsNewsItem {
  title: string;
  url: string;
  source: string;
}

export interface TrendingTopic {
  /** 급상승 검색어 자체 — docs/16 §2-B-1: "그대로 개체(entity) 후보가 된다". */
  title: string;
  approxTraffic: string | null;
  pubDate: string | null;
  newsItems: TrendsNewsItem[];
}

interface RawNewsItem {
  'ht:news_item_title'?: unknown;
  'ht:news_item_url'?: unknown;
  'ht:news_item_source'?: unknown;
}

interface RawTrendItem {
  title?: unknown;
  'ht:approx_traffic'?: unknown;
  pubDate?: unknown;
  'ht:news_item'?: RawNewsItem | RawNewsItem[];
}

export class TrendsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly parser: XMLParser;

  constructor(options: TrendsClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.parser = new XMLParser({ ignoreAttributes: false });
  }

  async fetchTrending(geo = 'KR'): Promise<TrendingTopic[]> {
    const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(url);
        if (!res.ok) {
          throw new Error(`Trends 응답 실패: HTTP ${res.status}`);
        }
        const xml = await res.text();
        return this.parseTrends(xml);
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await sleep(this.retryDelayMs);
        }
      }
    }
    throw new Error(
      `Google Trends 수집 실패 (geo=${geo}, 재시도 ${this.maxRetries}회 소진): ${String(lastError)}`,
    );
  }

  private parseTrends(xml: string): TrendingTopic[] {
    const doc = this.parser.parse(xml) as {
      rss?: { channel?: { item?: RawTrendItem | RawTrendItem[] } };
    };
    const items = doc.rss?.channel?.item;
    if (!items) {
      throw new Error('Trends 피드 형식을 인식할 수 없음 (item 없음) — 비공식 피드 변경 가능성');
    }
    return toArray(items).map(mapTrendItem);
  }
}

function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text'] ?? '');
  }
  return String(value);
}

function mapTrendItem(raw: RawTrendItem): TrendingTopic {
  const rawNewsItems = raw['ht:news_item'];
  const newsItems = rawNewsItems
    ? toArray(rawNewsItems).map((n) => ({
        title: textOf(n['ht:news_item_title']).trim(),
        url: textOf(n['ht:news_item_url']).trim(),
        source: textOf(n['ht:news_item_source']).trim(),
      }))
    : [];

  return {
    title: textOf(raw.title).trim(),
    approxTraffic: raw['ht:approx_traffic'] ? textOf(raw['ht:approx_traffic']) : null,
    pubDate: raw.pubDate ? textOf(raw.pubDate) : null,
    newsItems,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
