/**
 * T2.1.1 — 활성 news_source의 RSS 피드를 수집해 news_article에 적재한다.
 * docs/11-pipeline.md §2-①, docs/16-news-sources.md §1/§5 참조. 멱등 키는
 * news_article.url UNIQUE(canonical 정규화 후).
 *
 * 소스별로: (1) robots.txt 허용 여부 확인 — 막혀 있으면 즉시 is_active=false로
 * 끄고 건너뛴다. (2) ETag/Last-Modified로 조건부 요청 — 304면 파싱 스킵.
 * (3) 연속 실패 10회(docs/16 §1) → is_active=false로 자동 비활성화.
 *
 * 실행: pnpm --filter @gukjang/worker exec tsx src/collectors/sync-news-collect.ts
 */
import { toNewsArticleInsertInput } from '@gukjang/core';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { eq } from 'drizzle-orm';
import { RssClient } from './rss-client';

const MAX_CONSECUTIVE_ERRORS = 10;

export interface NewsCollectResult {
  sourcesChecked: number;
  sourcesDisabledByRobots: number;
  sourcesDisabledByErrors: number;
  fetched: number;
  inserted: number;
  skipped: number;
  notModified: number;
  sourceErrors: { sourceId: number; sourceName: string; error: string }[];
}

/**
 * db와 client를 주입받는 형태로 짜서 테스트/수동검증에서 실제 로컬 postgres +
 * 가짜(client) 조합으로 upsert 로직 자체는 검증할 수 있게 한다 (W1/W2와 동일 패턴).
 */
export async function syncNewsCollect(
  db: ReturnType<typeof getDb>,
  client: Pick<RssClient, 'fetchFeed' | 'checkRobotsAllowed'>,
  now: Date = new Date(),
): Promise<NewsCollectResult> {
  const sources = await db
    .select()
    .from(schema.newsSource)
    .where(eq(schema.newsSource.isActive, true));

  const result: NewsCollectResult = {
    sourcesChecked: 0,
    sourcesDisabledByRobots: 0,
    sourcesDisabledByErrors: 0,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    notModified: 0,
    sourceErrors: [],
  };

  for (const source of sources) {
    if (!source.feedUrl || source.kind !== 'RSS') continue;
    result.sourcesChecked++;

    const allowed = await client.checkRobotsAllowed(source.feedUrl);
    if (!allowed) {
      await db
        .update(schema.newsSource)
        .set({ isActive: false, lastPolledAt: now })
        .where(eq(schema.newsSource.id, source.id));
      result.sourcesDisabledByRobots++;
      continue;
    }

    let fetchResult;
    try {
      fetchResult = await client.fetchFeed(source.feedUrl, {
        etag: source.etag,
        lastModified: source.lastModified,
      });
    } catch (err) {
      const errorCount = source.errorCount + 1;
      const disable = errorCount >= MAX_CONSECUTIVE_ERRORS;
      await db
        .update(schema.newsSource)
        .set({ errorCount, lastPolledAt: now, ...(disable ? { isActive: false } : {}) })
        .where(eq(schema.newsSource.id, source.id));
      if (disable) result.sourcesDisabledByErrors++;
      result.sourceErrors.push({
        sourceId: source.id,
        sourceName: source.name,
        error: String(err),
      });
      continue;
    }

    if (fetchResult.status === 'not_modified') {
      result.notModified++;
      await db
        .update(schema.newsSource)
        .set({ errorCount: 0, lastPolledAt: now })
        .where(eq(schema.newsSource.id, source.id));
      continue;
    }

    result.fetched += fetchResult.items.length;

    for (const item of fetchResult.items) {
      const input = toNewsArticleInsertInput(item, source, now);
      if (!input) {
        result.skipped++;
        continue;
      }

      const inserted = await db
        .insert(schema.newsArticle)
        .values({
          sourceId: input.sourceId,
          url: input.url,
          title: input.title,
          lead: input.lead,
          publishedAt: input.publishedAt,
          simhash: input.simhash,
        })
        .onConflictDoNothing({ target: schema.newsArticle.url })
        .returning({ id: schema.newsArticle.id });

      if (inserted.length > 0) {
        result.inserted++;
      } else {
        result.skipped++;
      }
    }

    await db
      .update(schema.newsSource)
      .set({
        etag: fetchResult.etag,
        lastModified: fetchResult.lastModified,
        errorCount: 0,
        lastPolledAt: now,
      })
      .where(eq(schema.newsSource.id, source.id));
  }

  return result;
}

async function main(): Promise<void> {
  const { getDb: getDbFn, closeDb } = await import('@gukjang/db');
  const db = getDbFn();
  const client = new RssClient();
  console.log('뉴스 수집 시작…');
  const result = await syncNewsCollect(db, client);
  console.log('✓ 완료 —', result);
  await closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('✗ 뉴스 수집 실패:', err);
    process.exit(1);
  });
}
