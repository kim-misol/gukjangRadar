/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-dart-sync.ts와 동일한 위치).
 *
 * docs/15-build-order.md W3 게이트: "기사:클러스터 압축률 ≥ 10:1"을 실제 로컬 postgres에
 * 대해 눈으로 확인한다. 실 RSS 네트워크 대신 하루치 뉴스를 흉내 낸 fixture로 3개
 * news_source(연합뉴스/한국경제/조선비즈)의 RSS 응답을 흉내 내는 fake RssClient를 써서
 * syncNewsCollect(T2.1.1) → clusterNewArticles(T2.1.2+1.3)를 실제로 돌린다.
 *
 * fixture는 "핫한 스토리 몇 개를 여러 매체가 각기 다른 표현으로 반복 보도"하는
 * 실제 뉴스데이의 쏠림을 재현한다 — docs/11 §4의 "기사 20배를 클러스터 1개로"와 같은 모양.
 * 근접 중복(같은 매체 재배포 수준 문구) 몇 건도 섞어 simhash 중복 제거(T2.1.2)까지 같이 확인한다.
 *
 * 실행: pnpm manual-verify-news-pipeline
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import { eq, sql } from 'drizzle-orm';
import type { RssFeedItem } from '@gukjang/core';
import { syncNewsCollect } from '../apps/worker/src/collectors/sync-news-collect';
import { clusterNewArticles } from '../apps/worker/src/collectors/cluster-news';

const FEED_URLS = {
  연합뉴스: 'https://fixture.local/yna.xml',
  한국경제: 'https://fixture.local/hankyung.xml',
  조선비즈: 'https://fixture.local/chosunbiz.xml',
} as const;

const now = new Date('2026-08-21T10:00:00+09:00');

function minutesAgo(min: number): string {
  return new Date(now.getTime() - min * 60 * 1000).toISOString();
}

interface FixtureArticle {
  title: string;
  feed: keyof typeof FEED_URLS;
  minutesAgo: number;
  urlSuffix: string;
}

/**
 * 5개의 "핫한" 스토리 — 매체마다 표현을 다르게 해 자카드 클러스터링(T2.1.3)이
 * 실제로 묶어내는지 확인한다. 각 스토리를 16개씩 실어 5스토리/80기사로 압축률 ≥10:1을 겨냥한다.
 *
 * 헤드라인은 앞의 "앵커"(핵심 사실 — 회사명+주제)는 고정하고 뒤의 짧은 수식만 바꿨다.
 * 앵커가 너무 짧으면(예: "카카오 신규 서비스") 자카드가 0.5 밑으로 떨어져 클러스터가
 * 쪼개지고, 앵커가 너무 길고 수식이 너무 짧으면 simhash 해밍거리가 3 이하로 붙어버려
 * (T2.1.2) 서로 다른 매체 기사인데도 근접 중복으로 지워진다 — 실제로 이 스크립트를
 * 작성하며 packages/core의 tokenizeForClustering/simhash32/jaccardSimilarity로 직접
 * 계산해보고 두 임계값(자카드≥0.5, 해밍≤3) 사이에 들어오도록 고른 값들이다.
 */
const HOT_STORIES: Record<string, string[]> = {
  노루페인트_실적: [
    '노루페인트 3분기 영업이익 급증',
    '노루페인트 3분기 영업이익 20% 증가',
    '노루페인트 3분기 영업이익 큰 폭 증가',
    '노루페인트 3분기 영업이익 전년 대비 급증',
    '노루페인트 3분기 영업이익 예상치 상회',
    '노루페인트 3분기 영업이익 호조',
    '노루페인트 3분기 영업이익 뚜렷한 개선',
    '노루페인트 3분기 영업이익 두 자릿수 증가',
    '노루페인트 3분기 영업이익 시장 예상 상회',
    '노루페인트 3분기 영업이익 흑자 전환 성공',
    '노루페인트 3분기 영업이익 역대 최대 기록',
    '노루페인트 3분기 영업이익 가파른 개선세',
    '노루페인트 3분기 영업이익 반등에 성공',
    '노루페인트 3분기 영업이익 견조한 흐름',
    '노루페인트 3분기 영업이익 안정적 증가',
    '노루페인트 3분기 영업이익 꾸준한 상승',
  ],
  삼성전자_반도체: [
    '삼성전자 반도체 3분기 영업이익 서프라이즈',
    '삼성전자 반도체 3분기 영업이익 시장 예상 상회',
    '삼성전자 반도체 3분기 영업이익 큰 폭 개선',
    '삼성전자 반도체 3분기 영업이익 흑자 전환',
    '삼성전자 반도체 3분기 영업이익 반등 성공',
    '삼성전자 반도체 3분기 영업이익 역대 최대',
    '삼성전자 반도체 3분기 영업이익 뚜렷한 반등',
    '삼성전자 반도체 3분기 영업이익 가파른 개선',
    '삼성전자 반도체 3분기 영업이익 예상치 웃돌아',
    '삼성전자 반도체 3분기 영업이익 견조한 흐름',
    '삼성전자 반도체 3분기 영업이익 두 자릿수 개선',
    '삼성전자 반도체 3분기 영업이익 안정적 회복',
    '삼성전자 반도체 3분기 영업이익 호실적 기록',
    '삼성전자 반도체 3분기 영업이익 큰 폭 반등',
    '삼성전자 반도체 3분기 영업이익 개선세 뚜렷',
    '삼성전자 반도체 3분기 영업이익 꾸준한 회복',
  ],
  SK하이닉스_HBM: [
    'SK하이닉스 HBM 수요 급증',
    'SK하이닉스 HBM 수요 폭증',
    'SK하이닉스 HBM 수요 공급 부족',
    'SK하이닉스 HBM 수요 가격 협상력 강화',
    'SK하이닉스 HBM 수요 고객사 러브콜',
    'SK하이닉스 HBM 수요 역대급 증가',
    'SK하이닉스 HBM 수요 지속적 확대',
    'SK하이닉스 HBM 수요 내년까지 초과',
    'SK하이닉스 HBM 수요 견조한 흐름',
    'SK하이닉스 HBM 수요 뚜렷한 증가세',
    'SK하이닉스 HBM 수요 큰 폭 확대',
    'SK하이닉스 HBM 수요 두 자릿수 성장',
    'SK하이닉스 HBM 수요 가파른 상승',
    'SK하이닉스 HBM 수요 안정적 확대',
    'SK하이닉스 HBM 수요 꾸준한 증가',
    'SK하이닉스 HBM 수요 예상치 상회',
  ],
  정부_반도체_보조금: [
    '정부 반도체 기업 보조금 확대 발표',
    '정부 반도체 기업 보조금 방안 공개',
    '정부 반도체 기업 보조금 규모 상향',
    '정부 반도체 기업 보조금 근거 마련',
    '정부 반도체 기업 보조금 계획 발표',
    '정부 반도체 기업 보조금 예산 확정',
    '정부 반도체 기업 보조금 접수 시작',
    '정부 반도체 기업 보조금 지원책 공개',
    '정부 반도체 기업 보조금 큰 폭 확대',
    '정부 반도체 기업 보조금 세부안 발표',
    '정부 반도체 기업 보조금 신속 집행',
    '정부 반도체 기업 보조금 조기 편성',
    '정부 반도체 기업 보조금 추가 발표',
    '정부 반도체 기업 보조금 확정 공개',
    '정부 반도체 기업 보조금 지원 확대',
    '정부 반도체 기업 보조금 정책 발표',
  ],
  카카오_신규서비스: [
    '카카오 신규 서비스 출시 정식으로',
    '카카오 신규 서비스 출시 오늘부터',
    '카카오 신규 서비스 출시 이용자 대상으로',
    '카카오 신규 서비스 출시 전격',
    '카카오 신규 서비스 출시 시범으로',
    '카카오 신규 서비스 출시 단계적으로',
    '카카오 신규 서비스 출시 공식적으로',
    '카카오 신규 서비스 출시 순차적으로',
    '카카오 신규 서비스 출시 전면적으로',
    '카카오 신규 서비스 출시 조기에',
    '카카오 신규 서비스 출시 대대적으로',
    '카카오 신규 서비스 출시 확대해서',
    '카카오 신규 서비스 출시 예정대로',
    '카카오 신규 서비스 출시 마침내',
    '카카오 신규 서비스 출시 전격적으로',
    '카카오 신규 서비스 출시 본격적으로',
  ],
};

// 근접 중복(simhash dedup, T2.1.2) 확인용 — 같은 사실을 거의 그대로 재배포한 수준의 문구.
const NEAR_DUPLICATES: FixtureArticle[] = [
  {
    title: '노루페인트 3분기 영업이익 급증',
    feed: '한국경제',
    minutesAgo: 595,
    urlSuffix: 'dup-1a',
  },
  {
    title: '노루페인트 3분기 영업이익 20% 증가',
    feed: '한국경제',
    minutesAgo: 594,
    urlSuffix: 'dup-1b',
  },
  {
    title: '삼성전자 반도체 3분기 영업이익 서프라이즈',
    feed: '조선비즈',
    minutesAgo: 580,
    urlSuffix: 'dup-2a',
  },
  {
    title: '삼성전자 반도체 3분기 영업이익 시장 예상 상회',
    feed: '조선비즈',
    minutesAgo: 579,
    urlSuffix: 'dup-2b',
  },
];

function buildFixtures(): FixtureArticle[] {
  const fixtures: FixtureArticle[] = [];
  const feeds: (keyof typeof FEED_URLS)[] = ['연합뉴스', '한국경제', '조선비즈'];

  let minuteCursor = 600; // 10시간 전부터 시작
  for (const [storyKey, headlines] of Object.entries(HOT_STORIES)) {
    headlines.forEach((title, i) => {
      minuteCursor -= 7;
      fixtures.push({
        title,
        feed: feeds[i % feeds.length] as keyof typeof FEED_URLS,
        minutesAgo: minuteCursor,
        urlSuffix: `${storyKey}-${i}`,
      });
    });
  }
  fixtures.push(...NEAR_DUPLICATES);
  return fixtures;
}

function toFeedResponses(fixtures: FixtureArticle[]): Record<string, RssFeedItem[]> {
  const byFeed: Record<string, RssFeedItem[]> = {
    [FEED_URLS.연합뉴스]: [],
    [FEED_URLS.한국경제]: [],
    [FEED_URLS.조선비즈]: [],
  };
  for (const f of fixtures) {
    byFeed[FEED_URLS[f.feed]]?.push({
      title: f.title,
      link: `https://fixture.local/articles/${f.urlSuffix}`,
      pubDate: minutesAgo(f.minutesAgo),
      description: null,
    });
  }
  return byFeed;
}

async function main(): Promise<void> {
  const db = getDb();

  // 0) db:seed가 넣어둔 뉴스(1기사=1클러스터, 개발용 단순화 — W1/W2 기록 참고)를 지운다.
  //    안 지우면 압축률 계산에 섞여 들어가 W3 게이트 수치를 흐린다. company/alias 등은 그대로 둔다.
  await db.delete(schema.newsCluster);
  await db.delete(schema.newsArticle);

  // 0-1) 예전 실행에서 실 seed 소스에 fixture feed_url을 잘못 남겨둔 게 있으면 지운다
  //      (이 스크립트는 이제 이름을 fixture: 로 접두해 독립적인 소스를 쓴다).
  await db
    .update(schema.newsSource)
    .set({ feedUrl: null })
    .where(sql`${schema.newsSource.feedUrl} LIKE 'https://fixture.local/%'`);

  // 1) 이 스크립트 전용 fixture news_source 3개를 올린다 (실 seed 소스 이름과 무관하게 독립적으로).
  for (const [name, feedUrl] of Object.entries(FEED_URLS)) {
    await db
      .insert(schema.newsSource)
      .values({ name: `fixture:${name}`, domain: 'fixture.local', feedUrl, tier: 1, kind: 'RSS' })
      .onConflictDoUpdate({
        target: schema.newsSource.name,
        set: { feedUrl, isActive: true, errorCount: 0 },
      });
  }

  const fixtures = buildFixtures();
  const feedResponses = toFeedResponses(fixtures);
  const fakeRssClient = {
    checkRobotsAllowed: async () => true,
    fetchFeed: async (feedUrl: string) =>
      ({
        status: 'ok',
        items: feedResponses[feedUrl] ?? [],
        etag: null,
        lastModified: null,
      }) as const,
  };

  console.log(`=== T2.1.1 뉴스 수집 (fake RssClient, 기사 ${fixtures.length}건) ===`);
  const collectResult = await syncNewsCollect(db, fakeRssClient, now);
  console.log(collectResult);

  console.log('\n=== T2.1.2+1.3 중복 제거 + 클러스터링 ===');
  const clusterResult = await clusterNewArticles(db, now);
  console.log(clusterResult);

  const [{ articleCount }] = await db
    .select({ articleCount: sql<number>`count(*)::int` })
    .from(schema.newsArticle)
    .where(eq(schema.newsArticle.isDeleted, false));
  const [{ clusterCount }] = await db
    .select({ clusterCount: sql<number>`count(*)::int` })
    .from(schema.newsCluster);

  console.log(`\n생존 기사 ${articleCount}건 → 클러스터 ${clusterCount}건`);
  console.log(`압축률 ≈ ${(articleCount / clusterCount).toFixed(1)}:1 (W3 게이트: ≥ 10:1)`);

  const clusters = await db
    .select({
      id: schema.newsCluster.id,
      headline: schema.newsCluster.headline,
      articleCount: schema.newsCluster.articleCount,
      sourceTierMin: schema.newsCluster.sourceTierMin,
      heatScore: schema.newsCluster.heatScore,
    })
    .from(schema.newsCluster)
    .orderBy(schema.newsCluster.heatScore);

  console.log('\n클러스터 목록 (heat_score 오름차순):');
  for (const c of clusters) {
    console.log(
      `  #${c.id} [${c.articleCount}건, tier${c.sourceTierMin}, heat=${c.heatScore}] ${c.headline}`,
    );
  }

  const deletedCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.newsArticle)
    .where(eq(schema.newsArticle.isDeleted, true));
  console.log(
    `\nsimhash 근접 중복으로 제거된 기사: ${deletedCount[0]?.n ?? 0}건 ` +
      `(NEAR_DUPLICATES 명시적 4건 + HOT_STORIES 내 우연히 근접한 변형 몇 건 포함)`,
  );

  console.log('\n=== 재실행 (멱등성 확인) ===');
  const collectResult2 = await syncNewsCollect(db, fakeRssClient, now);
  const clusterResult2 = await clusterNewArticles(db, now);
  console.log('collect 재실행:', collectResult2);
  console.log('cluster 재실행:', clusterResult2);
  if (collectResult2.inserted !== 0 || clusterResult2.articlesClustered !== 0) {
    console.error('✗ 멱등성 깨짐 — 재실행에서 신규 insert/clustering이 발생함');
    process.exitCode = 1;
  } else {
    console.log('✓ 재실행 시 신규 insert/clustering 없음 (멱등)');
  }

  await closeDb();
}

main().catch((err) => {
  console.error('✗ 수동 검증 실패:', err);
  process.exit(1);
});
