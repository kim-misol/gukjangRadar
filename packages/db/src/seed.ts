/**
 * T0.2.3/T1.1.1 — 개발용 시드 스크립트: 더미 뉴스 5건 + 기업 20개 + 별칭 인덱스.
 * 실행: pnpm db:seed
 *
 * T1.1.2(자모 정규화/유사도)·T1.1.3(별칭 생성)이 준비됐으므로 임시 placeholder
 * 정규화(tempNormalize)는 걷어내고 `normalizeName`/`toJamo`/`generateAliasCandidates`를
 * 그대로 써서 company_alias까지 실데이터로 채운다. W2 게이트 검증
 * (노루→노루페인트/노루홀딩스, 원희→원익 후보)에 필요한 englishName/formerNames가
 * 있는 회사는 해당 필드를 채워 둔다.
 */
import {
  loadEnv,
  generateAliasCandidates,
  normalizeEntityName,
  normalizeName,
  toJamo,
} from '@gukjang/core';
import type { CompanyAliasInput } from '@gukjang/core';
import newsSourcesSeed from '@gukjang/spec/news_sources.seed.json';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

interface SeedCompany {
  ticker: string;
  name: string;
  market: (typeof schema.marketKind.enumValues)[number];
  sector?: string;
  isHolding?: boolean;
  englishName?: string;
  formerNames?: string[];
  brandNames?: string[];
  /**
   * OpenDART 고유번호. 개발 시드용 placeholder만 넣는다 — 샌드박스 네트워크가
   * DART를 막고 있어(W1/W2 기록 참조) 실제 등록번호로 검증하지 못했다.
   * T1.2.2/1.2.3(business_summary/AFFILIATION) 수동 검증을 위해 일부 회사에만 채운다.
   */
  corpCode?: string;
  /**
   * T1.2.2 business_summary 필드 개발 시드용 placeholder — 실제로는 DART 기반으로
   * sync-business-summary.ts가 채우는 값이다. 골든셋(G-004/G-005) SUPPLY_CHAIN 케이스가
   * G6(사업연관성 근거 확인) 가드레일을 실제로 통과하려면 business_summary에 경로 라벨과
   * 겹치는 문장이 있어야 하므로, 그 두 회사에 한해서만 짧게 채워 둔다.
   */
  businessSummary?: string;
}

const SEED_COMPANIES: SeedCompany[] = [
  {
    ticker: '005930',
    name: '삼성전자',
    market: 'KOSPI',
    sector: '전기전자',
    englishName: 'Samsung Electronics',
  },
  {
    ticker: '000660',
    name: 'SK하이닉스',
    market: 'KOSPI',
    sector: '전기전자',
    englishName: 'SK Hynix',
    // A6: 구사명 — docs/12-edge-cases.md §A6
    formerNames: ['하이닉스반도체'],
    corpCode: '10000003',
    businessSummary: 'HBM 등 메모리 반도체를 제조하는 반도체 기업이다.',
  },
  { ticker: '090350', name: '노루페인트', market: 'KOSPI', sector: '화학', corpCode: '10000001' },
  {
    ticker: '000320',
    name: '노루홀딩스',
    market: 'KOSPI',
    sector: '기타금융',
    isHolding: true,
    // docs/06-erd.md §3 예시의 corp_code(00126380)는 이 회사(노루홀딩스) 것 —
    // 마찬가지로 실 검증 전 placeholder.
    corpCode: '00126380',
  },
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
  // A1: 흔한 명사형 회사명 — docs/12-edge-cases.md §A1
  { ticker: '009240', name: '한샘', market: 'KOSPI', sector: '유통업' },
  { ticker: '003490', name: '대한항공', market: 'KOSPI', sector: '운수창고업' },
  { ticker: '086520', name: '에코프로', market: 'KOSDAQ', sector: '화학', isHolding: true },
  { ticker: '247540', name: '에코프로비엠', market: 'KOSDAQ', sector: '화학' },
  // W5(T2.3.1) SUPPLY_DICT 골든셋(G-005)·spec/prompts/company_matching.md FEW-SHOT 예시 그대로.
  {
    ticker: '042700',
    name: '한미반도체',
    market: 'KOSDAQ',
    sector: '반도체장비',
    businessSummary: 'HBM 생산 공정에 쓰이는 반도체장비(TC본더 등)를 공급하는 기업이다.',
  },
];

/**
 * W5(T2.3.1) THEME_DICT/SUPPLY_DICT 개념 사전 — spec/prompts/company_matching.md FEW-SHOT
 * "엔비디아 → AI 가속기 → HBM → SK하이닉스" / "...→ 반도체장비 → 한미반도체" 예시를 그대로
 * 최소 시드로 재현한다. docs/14 backlog T1.2.4(테마 300개)/T1.2.5(공급망 100쌍)의 전체 사전은
 * 아직 없다 — 이 4행은 그 전체 사전이 아니라 Recall 엔진(T2.3.1)이 실제로 동작함을 증명하는
 * 최소 예시다(W2의 business_summary/AFFILIATION처럼 실제 데이터가 준비되는 대로 확장할 것).
 */
interface SeedConcept {
  name: string;
  kind: string;
}
const SEED_CONCEPTS: SeedConcept[] = [
  { name: 'AI가속기', kind: 'PRODUCT' },
  { name: 'HBM', kind: 'MATERIAL' },
  { name: '반도체장비', kind: 'INDUSTRY' },
];
interface SeedConceptEdge {
  from: string;
  to: string;
  edgeType: (typeof schema.edgeKind.enumValues)[number];
  weight: number;
}
const SEED_CONCEPT_EDGES: SeedConceptEdge[] = [
  { from: 'AI가속기', to: 'HBM', edgeType: 'RELATED_CONCEPT', weight: 0.9 },
  { from: 'AI가속기', to: '반도체장비', edgeType: 'RELATED_CONCEPT', weight: 0.7 },
];
/** concept → company 공급망 엣지. company는 SEED_COMPANIES의 ticker로 찾는다. */
const SEED_SUPPLY_CHAIN_EDGES: { conceptName: string; companyTicker: string; weight: number }[] = [
  { conceptName: 'HBM', companyTicker: '000660', weight: 0.85 },
  { conceptName: '반도체장비', companyTicker: '042700', weight: 0.7 },
];

/**
 * docs/16-news-sources.md에서 실 네트워크로 검증한 A/B/C층 소스 목록.
 * spec/news_sources.seed.json이 단일 진실 원천 — 여기서 재정의하지 않는다(CLAUDE.md §3).
 * verification이 "VERIFIED_"로 시작하거나 "DOCUMENTED"가 아닌 항목은 is_active를 강제로
 * false로 덮는다 (재검증 전에는 폴링하지 않는다 — spec/news_sources.seed.json._readme 참고).
 */
const SEED_NEWS_SOURCES = newsSourcesSeed.sources.map((s) => ({
  name: s.name,
  domain: s.domain,
  kind: s.kind,
  feedUrl: s.feed_url,
  tier: s.tier,
  pollIntervalS: s.poll_interval_s,
  isActive:
    s.is_active && (s.verification.startsWith('VERIFIED') || s.verification === 'DOCUMENTED'),
}));

const SEED_ENTITY_STOPLIST = ['정부', '대통령실', '국회', '코스피', '코스닥', '증권가'];

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

  let aliasCount = 0;
  const companyIdByTicker = new Map<string, number>();

  await db.transaction(async (tx) => {
    // 기업 + 별칭 인덱스 (T1.1.1/T1.1.3)
    for (const c of SEED_COMPANIES) {
      const nameNorm = normalizeName(c.name);
      const [row] = await tx
        .insert(schema.company)
        .values({
          ticker: c.ticker,
          name: c.name,
          nameNorm,
          nameJamo: toJamo(nameNorm),
          market: c.market,
          sector: c.sector,
          isHolding: c.isHolding ?? false,
          corpCode: c.corpCode,
          businessSummary: c.businessSummary,
          businessSummaryUpdatedAt: c.businessSummary ? new Date() : undefined,
        })
        .onConflictDoUpdate({
          target: schema.company.ticker,
          set: {
            name: c.name,
            nameNorm,
            nameJamo: toJamo(nameNorm),
            corpCode: c.corpCode,
            businessSummary: c.businessSummary,
            businessSummaryUpdatedAt: c.businessSummary ? new Date() : undefined,
          },
        })
        .returning({ id: schema.company.id });
      if (!row) throw new Error(`기업 upsert 실패: ${c.name}`);
      companyIdByTicker.set(c.ticker, row.id);

      const aliasInput: CompanyAliasInput = {
        name: c.name,
        ticker: c.ticker,
        englishName: c.englishName,
        formerNames: c.formerNames,
        brandNames: c.brandNames,
        isHolding: c.isHolding,
      };
      for (const a of generateAliasCandidates(aliasInput)) {
        await tx
          .insert(schema.companyAlias)
          .values({
            companyId: row.id,
            alias: a.alias,
            aliasNorm: a.aliasNorm,
            aliasJamo: a.aliasJamo,
            aliasType: a.aliasType,
            isAmbiguous: a.isAmbiguous,
            source: 'seed',
          })
          .onConflictDoNothing({
            target: [
              schema.companyAlias.companyId,
              schema.companyAlias.aliasNorm,
              schema.companyAlias.aliasType,
            ],
          });
        aliasCount++;
      }
    }

    // 뉴스 소스 (docs/16-news-sources.md — A/B/C층)
    const sourceIds: number[] = [];
    for (const s of SEED_NEWS_SOURCES) {
      const [row] = await tx
        .insert(schema.newsSource)
        .values(s)
        .onConflictDoUpdate({
          target: schema.newsSource.name,
          set: {
            domain: s.domain,
            kind: s.kind,
            feedUrl: s.feedUrl,
            tier: s.tier,
            pollIntervalS: s.pollIntervalS,
            isActive: s.isActive,
          },
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

    // 불용 개체 블랙리스트 — docs/08-prompt-entity-extraction.md §6-⑤ 그대로.
    for (const name of SEED_ENTITY_STOPLIST) {
      await tx
        .insert(schema.entityStoplist)
        .values({ nameNorm: normalizeEntityName(name), reason: '매일 등장하는 일반 기관/지수명' })
        .onConflictDoNothing({ target: schema.entityStoplist.nameNorm });
    }

    // 개념 사전 최소 시드 (T2.3.1 THEME_DICT/SUPPLY_DICT 실동작 증명 — 위 SEED_CONCEPTS 주석 참고)
    const conceptIdByName = new Map<string, number>();
    const conceptNodeIdByName = new Map<string, number>();
    for (const c of SEED_CONCEPTS) {
      const nameNorm = normalizeName(c.name);
      const [row] = await tx
        .insert(schema.concept)
        .values({ name: c.name, nameNorm, kind: c.kind })
        .onConflictDoUpdate({ target: schema.concept.name, set: { nameNorm, kind: c.kind } })
        .returning({ id: schema.concept.id });
      if (!row) throw new Error(`개념 upsert 실패: ${c.name}`);
      conceptIdByName.set(c.name, row.id);

      const [node] = await tx
        .insert(schema.graphNode)
        .values({ kind: 'CONCEPT', refId: row.id, label: c.name })
        .onConflictDoUpdate({
          target: [schema.graphNode.kind, schema.graphNode.refId],
          set: { label: c.name },
        })
        .returning({ id: schema.graphNode.id });
      if (!node) throw new Error(`개념 graph_node upsert 실패: ${c.name}`);
      conceptNodeIdByName.set(c.name, node.id);
    }

    const companyNodeIdByTicker = new Map<string, number>();
    for (const ticker of SEED_SUPPLY_CHAIN_EDGES.map((e) => e.companyTicker)) {
      if (companyNodeIdByTicker.has(ticker)) continue;
      const companyId = companyIdByTicker.get(ticker);
      const company = SEED_COMPANIES.find((c) => c.ticker === ticker);
      if (!companyId || !company) throw new Error(`공급망 시드 대상 기업 없음: ${ticker}`);
      const [node] = await tx
        .insert(schema.graphNode)
        .values({ kind: 'COMPANY', refId: companyId, label: company.name })
        .onConflictDoUpdate({
          target: [schema.graphNode.kind, schema.graphNode.refId],
          set: { label: company.name },
        })
        .returning({ id: schema.graphNode.id });
      if (!node) throw new Error(`기업 graph_node upsert 실패: ${ticker}`);
      companyNodeIdByTicker.set(ticker, node.id);
    }

    for (const e of SEED_CONCEPT_EDGES) {
      const srcNodeId = conceptNodeIdByName.get(e.from);
      const dstNodeId = conceptNodeIdByName.get(e.to);
      if (!srcNodeId || !dstNodeId) throw new Error(`개념 엣지 노드 없음: ${e.from} → ${e.to}`);
      await tx
        .insert(schema.graphEdge)
        .values({
          srcNodeId,
          dstNodeId,
          edgeType: e.edgeType,
          weight: e.weight.toString(),
          confidence: e.weight.toString(),
          origin: 'DICTIONARY',
          evidence: { source: 'DICTIONARY', label: `${e.from} → ${e.to}`, seed: true },
        })
        .onConflictDoUpdate({
          target: [
            schema.graphEdge.srcNodeId,
            schema.graphEdge.dstNodeId,
            schema.graphEdge.edgeType,
          ],
          set: { weight: e.weight.toString(), confidence: e.weight.toString() },
        });
    }

    for (const e of SEED_SUPPLY_CHAIN_EDGES) {
      const srcNodeId = conceptNodeIdByName.get(e.conceptName);
      const dstNodeId = companyNodeIdByTicker.get(e.companyTicker);
      if (!srcNodeId || !dstNodeId)
        throw new Error(`공급망 엣지 노드 없음: ${e.conceptName} → ${e.companyTicker}`);
      await tx
        .insert(schema.graphEdge)
        .values({
          srcNodeId,
          dstNodeId,
          edgeType: 'SUPPLY_CHAIN',
          weight: e.weight.toString(),
          confidence: e.weight.toString(),
          origin: 'DICTIONARY',
          evidence: { source: 'DICTIONARY', label: `${e.conceptName} 공급망`, seed: true },
        })
        .onConflictDoUpdate({
          target: [
            schema.graphEdge.srcNodeId,
            schema.graphEdge.dstNodeId,
            schema.graphEdge.edgeType,
          ],
          set: { weight: e.weight.toString(), confidence: e.weight.toString() },
        });
    }
  });

  console.log(
    `✓ 시드 완료: 기업 ${SEED_COMPANIES.length}개, 별칭 ${aliasCount}개, 뉴스 ${SEED_NEWS.length}건`,
  );
  await pgClient.end();
}

main().catch((err) => {
  console.error('✗ 시드 실패:', err);
  process.exit(1);
});
