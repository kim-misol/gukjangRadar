/**
 * T2.1.1~1.2 — RSS 원시 아이템을 news_article insert 입력으로 정제한다.
 * 순수 함수. 제목 정규화(②) + URL 정규화(docs/16 §1) + simhash 계산(③에서 쓸 값)까지
 * 이 시점에 끝내 DB 컬럼(news_article.title/url/simhash)에 바로 넣을 수 있게 한다.
 */
import { normalizeTitleForDisplay, tokenizeForClustering } from './title-normalize';
import { simhash32 } from './simhash';
import { canonicalizeUrl } from './canonical-url';
import type { NewsArticleInsertInput, RssFeedItem } from './types';

const LEAD_MAX_LENGTH = 200;

function truncateLead(raw: string): string | null {
  const stripped = raw
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length === 0) return null;
  return stripped.length > LEAD_MAX_LENGTH ? stripped.slice(0, LEAD_MAX_LENGTH) : stripped;
}

/** 제목/링크가 없는 아이템은 저장할 수 없으므로 null을 반환한다(데이터 없는 것을 지어내지 않는다). */
export function toNewsArticleInsertInput(
  item: RssFeedItem,
  source: { id: number; name: string },
  now: Date = new Date(),
): NewsArticleInsertInput | null {
  const title = normalizeTitleForDisplay(item.title ?? '', source.name);
  const rawUrl = (item.link ?? '').trim();
  if (title.length === 0 || rawUrl.length === 0) return null;
  const url = canonicalizeUrl(rawUrl);

  const parsedDate = item.pubDate ? new Date(item.pubDate) : null;
  const publishedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : now;

  const simhash = simhash32(tokenizeForClustering(title));

  return {
    sourceId: source.id,
    url,
    title,
    lead: item.description ? truncateLead(item.description) : null,
    publishedAt,
    simhash,
  };
}
