/**
 * T2.1.1 — RSS/Atom 피드 수집기. docs/11-pipeline.md §2-①, docs/16-news-sources.md §1 참조.
 * "제휴 API 우선, 없으면 RSS" 원칙에서 이 클라이언트는 RSS/Atom 폴백 경로를 담당한다.
 */
import { XMLParser } from 'fast-xml-parser';
import { isPathAllowed, parseRobotsTxt } from '@gukjang/core';
import type { RssFeedItem } from '@gukjang/core';

/** docs/16 §1: "User-Agent에 서비스명과 연락처를 명시한다(차단당했을 때 협의 창구가 된다)". */
const DEFAULT_USER_AGENT = 'gukjang-radar-collector/0.1 (+contact: dev@gukjang-radar.example)';

export interface RssClientOptions {
  /** 테스트/모킹용 주입 지점. 기본값은 전역 fetch. */
  fetchImpl?: typeof fetch;
  /** 요청 실패 시 재시도 횟수 */
  maxRetries?: number;
  /** 재시도 간 대기(ms) */
  retryDelayMs?: number;
  userAgent?: string;
}

export interface FetchFeedCacheHeaders {
  etag?: string | null;
  lastModified?: string | null;
}

export type FetchFeedResult =
  | { status: 'ok'; items: RssFeedItem[]; etag: string | null; lastModified: string | null }
  | { status: 'not_modified' };

interface RawFeedItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  description?: unknown;
  updated?: unknown;
  published?: unknown;
  summary?: unknown;
}

export class RssClient {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly userAgent: string;
  private readonly parser: XMLParser;

  constructor(options: RssClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.parser = new XMLParser({ ignoreAttributes: false });
  }

  /**
   * `{origin}/robots.txt`를 가져와 이 피드 경로가 허용되는지 확인한다.
   * robots.txt가 없거나(404) 가져오기 자체가 실패하면 "제한 없음"으로 간주한다
   * (robots.txt 부재는 표준적으로 전체 허용을 뜻한다 — 확인 실패를 확인된 차단보다
   * 더 엄격하게 다루지 않는다).
   */
  async checkRobotsAllowed(feedUrl: string): Promise<boolean> {
    let target: URL;
    try {
      target = new URL(feedUrl);
    } catch {
      return true;
    }

    try {
      const res = await this.fetchImpl(`${target.origin}/robots.txt`, {
        headers: { 'User-Agent': this.userAgent },
      });
      if (!res.ok) return true;
      const text = await res.text();
      const rules = parseRobotsTxt(text, this.userAgent);
      return isPathAllowed(target.pathname, rules);
    } catch {
      return true;
    }
  }

  /**
   * 피드 URL 하나를 가져와 아이템 배열로 파싱한다. ETag/Last-Modified를 넘기면
   * 조건부 요청(If-None-Match/If-Modified-Since)을 보내 304면 파싱을 스킵한다
   * (docs/16 §1: "대역폭·CPU 90% 절감").
   */
  async fetchFeed(feedUrl: string, cache: FetchFeedCacheHeaders = {}): Promise<FetchFeedResult> {
    const headers: Record<string, string> = { 'User-Agent': this.userAgent };
    if (cache.etag) headers['If-None-Match'] = cache.etag;
    if (cache.lastModified) headers['If-Modified-Since'] = cache.lastModified;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(feedUrl, { headers });
        if (res.status === 304) {
          return { status: 'not_modified' };
        }
        if (!res.ok) {
          throw new Error(`RSS 응답 실패: HTTP ${res.status}`);
        }
        const xml = await res.text();
        return {
          status: 'ok',
          items: this.parseFeed(xml),
          etag: res.headers.get('etag'),
          lastModified: res.headers.get('last-modified'),
        };
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await sleep(this.retryDelayMs);
        }
      }
    }
    throw new Error(
      `RSS 피드 수집 실패 (${feedUrl}, 재시도 ${this.maxRetries}회 소진): ${String(lastError)}`,
    );
  }

  private parseFeed(xml: string): RssFeedItem[] {
    const doc = this.parser.parse(xml) as {
      rss?: { channel?: { item?: RawFeedItem | RawFeedItem[] } };
      feed?: { entry?: RawFeedItem | RawFeedItem[] };
    };

    const channelItems = doc.rss?.channel?.item;
    if (channelItems) {
      return toArray(channelItems).map(mapRssItem);
    }

    const atomEntries = doc.feed?.entry;
    if (atomEntries) {
      return toArray(atomEntries).map(mapAtomEntry);
    }

    throw new Error('RSS/Atom 피드 형식을 인식할 수 없음 (item/entry 없음)');
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

function mapRssItem(raw: RawFeedItem): RssFeedItem {
  return {
    title: textOf(raw.title).trim(),
    link: textOf(raw.link).trim(),
    pubDate: raw.pubDate ? textOf(raw.pubDate) : null,
    description: raw.description ? textOf(raw.description) : null,
  };
}

function mapAtomEntry(raw: RawFeedItem): RssFeedItem {
  const rawLink = raw.link as { '@_href'?: string } | string | undefined;
  const link = typeof rawLink === 'object' ? (rawLink?.['@_href'] ?? '') : (rawLink ?? '');

  return {
    title: textOf(raw.title).trim(),
    link: String(link).trim(),
    pubDate: raw.updated ? textOf(raw.updated) : raw.published ? textOf(raw.published) : null,
    description: raw.summary ? textOf(raw.summary) : null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
