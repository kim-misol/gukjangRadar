/**
 * T0.2.3 — 개발용 시드 스크립트: 더미 뉴스 5건 + 기업 20개.
 * 실행: pnpm db:seed
 *
 * 주의: name_norm/name_jamo 정규화는 아직 T1.1.2(정식 유틸)가 없으므로
 * 여기서는 임시 placeholder 정규화만 쓴다. T1.1.2가 만들어지면 이 파일도
 * `normalizeName`/`toJamo`를 import해서 다시 시드할 것.
 */
import { loadEnv } from '@gukjang/core';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// 임시 정규화 (T1.1.2 도입 전까지만 사용)
function tempNormalize(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

interface SeedCompany {
  ticker: string;
  name: string;
  market: (typeof schema.marketKind.enumValues)[number];
  sector?: string;
  isHolding?: boolean;
}

const SEED_COMPANIES: SeedCompany[] = [
  { ticker: '005930', name: '삼성전자', market: 'KOSPI', sector: '전기전자' },
  { ticker: '000660', name: 'SK하이닉스', market: 'KOSPI', sector: '전기전자' },
  { ticker: '090350', name: '노루페인트', market: 'KOSPI', sector: '화학' },
  { ticker: '000320', name: '노루홀딩스', market: 'KOSPI', sector: '기타금융', isHolding: true },
  { ticker: '240810', name: '원익IPS', market: 'KOSDAQ', sector: '반도체장비' },
  { ticker: '049800', name: '원익홀딩스', market: 'KOSDAQ', sector: '기타금융', isHolding: true },
  { ticker: '373220', name: 'LG에너지솔루션', market: 'KOSPI', sector: '전기전자' },
  { ticker: '005380', name: '현대차', market: 'KOSPI', sector: '운수장비' },
  { ticker: '000270', name: '기아', market: 'KOSPI', sector: '운수장비' },
  { ticker: '035420', name: 'NAVER', market: 'KOSPI', sector: '서비스업' },
  { ticker: '035720', name: '카카오', market: 'KOSPI', sector: '서비스업' },
  { ticker: '068270', name: '셀트리온', market: 'KOSPI', sector: '의약품' },
  { ticker: '005490', name: 'POSCO홀딩스', market: 'KOSPI', sector: '철강금속', isHolding: true },
  { ticker: '207940', name: '삼성바이오로직스', market: 'KOSPI', sector: '의약품' },
  { ticker: '051910', name: 'LG화학', market: 'KOSPI', sector: '화학' },
  { ticker: '215600', name: '신라젠', market: 'KOSDAQ', sector: '의약품' },
  { ticker: '009240', name: '한샘', market: 'KOSPI', sector: '유통업' },
  { ticker: '003490', name: '대한항공', market: 'KOSPI', sector: '운수창고업' },
  { ticker: '086520', name: '에코프로', market: 'KOSDAQ', sector: '화학', isHolding: true },
  { ticker: '247540', name: '에코프로비엠', market: 'KOSDAQ', sector: '화학' },
];

const SEED_NEWS_SOURCES = [
  { name: '연합뉴스', domain: 'yna.co.kr', tier: 1 },
  { name: '한국경제', domain: 'hankyung.com', tier: 1 },
  { name: '조선비즈', domain: 'biz.chosun.com', tier: 2 },
];

interface SeedNews {
  sourceIndex: number;
  title: string;
  url: string;
}

const SEED_NEWS: SeedNews[] = [
  {
    sourceIndex: 0,
    title: "태풍 '노루' 북상…남부지방 강풍·호우 피해 우려",
    url: 'https://example.com/yna/typhoon-noru',
  },
  {
    sourceIndex: 2,
    title: 'SK하이닉스, HBM4 양산 돌입…AI 반도체 수요 대응',
    url: 'https://example.com/biz/sk-hynix-hbm4',
  },
  {
    sourceIndex: 1,
    title: '폭염 지속에 냉방·전력 관련 업종 강세',
    url: 'https://example.com/hankyung/heatwave-power',
  },
  {
    sourceIndex: 0,
    title: '이름 유사 논란 확산…관련설 도는 종목들 급등락',
    url: 'https://example.com/yna/name-similarity-rumor',
  },
  {
    sourceIndex: 2,
    title: '현대차·기아, 전기차 판매 호조로 실적 개선',
    url: 'https://example.com/biz/hyundai-kia-ev',
  },
];

async function main(): Promise<void> {
  const env = loadEnv();
  const pgClient = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(pgClient, { schema });

  console.log('시드 시작…');

  await db.transaction(async (tx) => {
    // 기업
    for (const c of SEED_COMPANIES) {
      await tx
        .insert(schema.company)
        .values({
          ticker: c.ticker,
          name: c.name,
          nameNorm: tempNormalize(c.name),
          nameJamo: tempNormalize(c.name),
          market: c.market,
          sector: c.sector,
          isHolding: c.isHolding ?? false,
        })
        .onConflictDoNothing({ target: schema.company.ticker });
    }

    // 뉴스 소스
    const sourceIds: number[] = [];
    for (const s of SEED_NEWS_SOURCES) {
      const [row] = await tx
        .insert(schema.newsSource)
        .values(s)
        .onConflictDoUpdate({
          target: schema.newsSource.name,
          set: { domain: s.domain },
        })
        .returning({ id: schema.newsSource.id });
      if (!row) throw new Error(`뉴스 소스 upsert 실패: ${s.name}`);
      sourceIds.push(row.id);
    }

    // 뉴스 기사 + 클러스터 (1기사 = 1클러스터, 개발용 단순화)
    const now = new Date();
    const tradeDate = now.toISOString().slice(0, 10);

    for (const n of SEED_NEWS) {
      const sourceId = sourceIds[n.sourceIndex];
      if (sourceId === undefined) throw new Error(`알 수 없는 sourceIndex: ${n.sourceIndex}`);

      const [inserted] = await tx
        .insert(schema.newsArticle)
        .values({
          sourceId,
          url: n.url,
          title: n.title,
          publishedAt: now,
        })
        .onConflictDoNothing({ target: schema.newsArticle.url })
        .returning({ id: schema.newsArticle.id });

      // onConflictDoNothing 이 아무것도 반환하지 않을 수 있으므로 재조회
      const articleRow =
        inserted ??
        (
          await tx
            .select({ id: schema.newsArticle.id })
            .from(schema.newsArticle)
            .where(eq(schema.newsArticle.url, n.url))
        )[0];
      if (!articleRow) throw new Error(`뉴스 기사 조회 실패: ${n.url}`);

      const [cluster] = await tx
        .insert(schema.newsCluster)
        .values({
          headline: n.title,
          tradeDate,
          firstSeenAt: now,
          lastSeenAt: now,
          articleCount: 1,
          analysisStatus: 'PENDING',
          representativeArticleId: articleRow.id,
        })
        .returning({ id: schema.newsCluster.id });
      if (!cluster) throw new Error(`뉴스 클러스터 생성 실패: ${n.title}`);

      await tx
        .insert(schema.clusterArticle)
        .values({ clusterId: cluster.id, articleId: articleRow.id })
        .onConflictDoNothing();
    }
  });

  console.log(`✓ 시드 완료: 기업 ${SEED_COMPANIES.length}개, 뉴스 ${SEED_NEWS.length}건`);
  await pgClient.end();
}

main().catch((err) => {
  console.error('✗ 시드 실패:', err);
  process.exit(1);
});
