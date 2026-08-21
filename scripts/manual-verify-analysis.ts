/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-*.ts와 동일한 위치).
 *
 * docs/15-build-order.md W4 게이트: "'태풍 노루' 입력 시 노루(WORD/TYPHOON_NAME) 개체가
 * 나온다"(docs/14 T2.2.4 DoD)를 실제 로컬 postgres에 대해 확인한다. ANTHROPIC_API_KEY가
 * 없어(.env 미설정) 실 LLM 호출은 못 하지만, docs/08 few-shot 예시 그대로를 반환하는
 * fake AnthropicLlmClient로 summarizeCluster(T2.2.2) → extractEntitiesForCluster
 * (T2.2.3+2.2.4) 전체 파이프라인을 실제 DB에 대해 돌린다 — W1/W2 manual-verify-dart-sync와
 * 같은 패턴.
 *
 * 실행: pnpm manual-verify-analysis
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import { eq } from 'drizzle-orm';
import type {
  AnthropicLlmClient,
  CallToolParams,
  CallToolResult,
} from '../apps/worker/src/llm/anthropic-client';
import { summarizeCluster } from '../apps/worker/src/analysis/summarize-cluster';
import { extractEntitiesForCluster } from '../apps/worker/src/analysis/extract-entities';

const now = new Date('2026-08-21T10:00:00+09:00');
const MODEL = 'claude-haiku-4-5';

// docs/08-prompt-entity-extraction.md few-shot 예시 그대로.
// 원문(title/lead)과 21자 이상 겹치지 않도록 packages/core의 findLongVerbatimQuotes로
// 직접 확인하고 고른 문장들이다 (quote-guard가 실제로 통과시켜야 하는 "정상" 케이스).
const SUMMARY_SENTENCES = [
  '제11호 태풍 노루가 한반도로 다가오고 있다.',
  '제주도가 영향권에 놓이며 지역 대비가 요구된다.',
  '많은 이들이 이번 태풍의 진로를 주시하고 있다.',
];
const ENTITY_FEWSHOT = [
  {
    surface: "태풍 '노루'",
    normalized: '태풍노루',
    kind: 'EVENT' as const,
    subtype: 'WEATHER',
    importance: 1.0,
    in_headline: true,
    role: 'SUBJECT' as const,
    aliases: ['제11호 태풍 노루'],
  },
  {
    surface: '노루',
    normalized: '노루',
    kind: 'WORD' as const,
    subtype: 'TYPHOON_NAME',
    importance: 0.7,
    in_headline: true,
    role: 'SUBJECT' as const,
    parent: "태풍 '노루'",
  },
  {
    surface: '제주',
    normalized: '제주',
    kind: 'PLACE' as const,
    subtype: 'REGION',
    importance: 0.5,
    in_headline: true,
    role: 'OBJECT' as const,
  },
  // entity_stoplist 필터링 확인용 — docs/08 §6-⑤ 목록에 있는 불용 개체.
  {
    surface: '정부',
    normalized: '정부',
    kind: 'ORG' as const,
    importance: 0.2,
    in_headline: false,
    role: 'CONTEXT' as const,
  },
];

function fakeCallToolResult<T>(
  data: T,
  inputTokens: number,
  outputTokens: number,
): CallToolResult<T> {
  return {
    output: data,
    usage: { inputTokens, outputTokens },
    latencyMs: 1,
    rawOutput: data,
    attempts: 1,
  };
}

function makeFakeClient(): Pick<AnthropicLlmClient, 'callTool'> {
  let callCount = 0;
  return {
    callTool: async <T>(params: CallToolParams<T>): Promise<CallToolResult<T>> => {
      callCount++;
      if (params.tool.name === 'emit_summary') {
        const parsed = params.parseOutput({ sentences: SUMMARY_SENTENCES });
        if (!parsed.success) throw new Error(`fake summary가 스키마 검증 실패: ${parsed.error}`);
        return fakeCallToolResult(parsed.data, 500, 80);
      }
      if (params.tool.name === 'emit_entities') {
        const parsed = params.parseOutput({ entities: ENTITY_FEWSHOT });
        if (!parsed.success) throw new Error(`fake entities가 스키마 검증 실패: ${parsed.error}`);
        return fakeCallToolResult(parsed.data, 600, 200);
      }
      throw new Error(`알 수 없는 도구: ${params.tool.name} (호출 ${callCount}번째)`);
    },
  };
}

async function setupCluster(
  db: ReturnType<typeof getDb>,
  variant: { urlSuffix: string; title: string; lead?: string },
): Promise<number> {
  const [source] = await db
    .insert(schema.newsSource)
    .values({ name: 'fixture:태풍뉴스', domain: 'fixture.local', tier: 1, kind: 'RSS' })
    .onConflictDoUpdate({ target: schema.newsSource.name, set: { tier: 1 } })
    .returning({ id: schema.newsSource.id });
  if (!source) throw new Error('news_source 생성 실패');

  const url = `https://fixture.local/articles/${variant.urlSuffix}`;
  const [article] = await db
    .insert(schema.newsArticle)
    .values({
      sourceId: source.id,
      url,
      title: variant.title,
      lead: variant.lead,
      publishedAt: now,
      simhash: 0,
    })
    .onConflictDoUpdate({ target: schema.newsArticle.url, set: { title: variant.title } })
    .returning({ id: schema.newsArticle.id });
  if (!article) throw new Error('news_article 생성 실패');

  const [cluster] = await db
    .insert(schema.newsCluster)
    .values({
      headline: variant.title,
      tradeDate: '2026-08-21',
      firstSeenAt: now,
      lastSeenAt: now,
      articleCount: 1,
      sourceTierMin: 1,
      representativeArticleId: article.id,
      analysisStatus: 'PENDING',
    })
    .returning({ id: schema.newsCluster.id });
  if (!cluster) throw new Error('news_cluster 생성 실패');

  await db
    .insert(schema.clusterArticle)
    .values({ clusterId: cluster.id, articleId: article.id })
    .onConflictDoNothing();

  return cluster.id;
}

const TYPHOON_VARIANT = {
  urlSuffix: 'typhoon-noru',
  title: "제11호 태풍 '노루' 북상… 제주 직접 영향권",
  lead: '기상청은 태풍 노루가 북상하며 제주가 직접 영향권에 들 것으로 예보했다.',
};

async function main(): Promise<void> {
  const db = getDb();

  console.log('=== 0) fixture 클러스터 준비 ("태풍 노루") ===');
  const clusterId = await setupCluster(db, TYPHOON_VARIANT);
  console.log('clusterId =', clusterId);

  const config = { model: MODEL, dailyCostCapUsd: 20 };
  const fakeClient = makeFakeClient();

  console.log('\n=== T2.2.2 요약 ===');
  const summaryResult = await summarizeCluster(db, fakeClient, clusterId, config, now);
  console.log(summaryResult);

  console.log('\n=== T2.2.3+2.2.4 개체 추출 + 정규화/병합/불용어 + graph_node/MENTIONS ===');
  const entityResult = await extractEntitiesForCluster(db, fakeClient, clusterId, config, now);
  console.log(entityResult);

  console.log('\n=== W4 DoD 확인: "노루"(WORD/TYPHOON_NAME) 개체가 나오는가 ===');
  const [noruEntity] = await db
    .select({
      id: schema.entity.id,
      name: schema.entity.name,
      kind: schema.entity.kind,
      subtype: schema.entity.subtype,
      mentionTotal: schema.entity.mentionTotal,
    })
    .from(schema.entity)
    .where(eq(schema.entity.nameNorm, '노루'));
  console.log('entity:', noruEntity);
  if (!noruEntity || noruEntity.kind !== 'WORD' || noruEntity.subtype !== 'TYPHOON_NAME') {
    console.error('✗ DoD 실패: 노루(WORD/TYPHOON_NAME) 개체를 찾지 못함');
    process.exitCode = 1;
  } else {
    console.log('✓ DoD 통과');
  }

  console.log('\n=== entity_stoplist 필터링 확인 ("정부"는 저장되지 않아야 함) ===');
  const govRows = await db.select().from(schema.entity).where(eq(schema.entity.nameNorm, '정부'));
  console.log(
    `"정부" 저장된 행 수: ${govRows.length} (기대: 0), entitiesStoplisted=${entityResult.entitiesStoplisted}`,
  );

  console.log('\n=== graph_node/graph_edge(MENTIONS) 확인 ===');
  const mentionsEdges = await db
    .select({
      edgeType: schema.graphEdge.edgeType,
      weight: schema.graphEdge.weight,
      dstLabel: schema.graphNode.label,
    })
    .from(schema.graphEdge)
    .innerJoin(schema.graphNode, eq(schema.graphEdge.dstNodeId, schema.graphNode.id))
    .where(eq(schema.graphEdge.edgeType, 'MENTIONS'));
  console.log('MENTIONS 엣지:', mentionsEdges);

  console.log('\n=== llm_run 기록 확인 (SUMMARY + ENTITY, cost_usd 계산됨) ===');
  const llmRuns = await db
    .select({
      stage: schema.llmRun.stage,
      status: schema.llmRun.status,
      costUsd: schema.llmRun.costUsd,
      inputTokens: schema.llmRun.inputTokens,
      outputTokens: schema.llmRun.outputTokens,
    })
    .from(schema.llmRun);
  console.log(llmRuns);

  console.log(
    '\n=== input_hash 캐시 재사용 확인 (같은 클러스터로 재실행 시 CACHED, 새 llm_run 없음) ===',
  );
  const beforeCount = (await db.select().from(schema.llmRun)).length;
  const summaryAgain = await summarizeCluster(db, fakeClient, clusterId, config, now);
  const entitiesAgain = await extractEntitiesForCluster(db, fakeClient, clusterId, config, now);
  const afterCount = (await db.select().from(schema.llmRun)).length;
  console.log(`재실행 결과: summary=${summaryAgain.status}, entities=${entitiesAgain.status}`);
  console.log(`llm_run 행 수: ${beforeCount} → ${afterCount} (캐시 히트면 그대로여야 함)`);
  if (
    summaryAgain.status !== 'CACHED' ||
    entitiesAgain.status !== 'CACHED' ||
    afterCount !== beforeCount
  ) {
    console.error('✗ 캐시 재사용 실패');
    process.exitCode = 1;
  } else {
    console.log('✓ input_hash 캐시 재사용 확인');
  }

  console.log('\n=== 일일 비용 상한 확인 (상한 0으로 두면 SKIPPED_COST_CAP) ===');
  const capClusterId = await setupCapTestCluster(db);
  const cappedSummary = await summarizeCluster(
    db,
    fakeClient,
    capClusterId,
    { model: MODEL, dailyCostCapUsd: 0 },
    now,
  );
  console.log('capped:', cappedSummary);
  if (cappedSummary.status !== 'SKIPPED_COST_CAP') {
    console.error('✗ 비용 상한 스킵 실패');
    process.exitCode = 1;
  } else {
    console.log('✓ 비용 상한 초과 시 스킵 확인');
  }

  console.log('\n=== quote-guard 확인 (원문 20자 초과 그대로 인용 시 저장 거부) ===');
  const quoteClusterId = await setupCluster(db, {
    urlSuffix: 'typhoon-noru-quote-test',
    title: '태풍 노루 관련 별도 속보',
    lead: '기상청은 태풍 노루가 북상하며 제주가 직접 영향권에 들 것으로 예보했다.',
  });
  const verbatimClient: Pick<AnthropicLlmClient, 'callTool'> = {
    callTool: async <T>(params: CallToolParams<T>): Promise<CallToolResult<T>> => {
      const parsed = params.parseOutput({
        sentences: [
          '기상청은 태풍 노루가 북상하며 제주가 직접 영향권에 들 것으로 예보했다.',
          '두 번째 문장이다.',
          '세 번째 문장이다.',
        ],
      });
      if (!parsed.success) throw new Error(parsed.error);
      return fakeCallToolResult(parsed.data as T, 100, 50);
    },
  };
  const quoteResult = await summarizeCluster(db, verbatimClient, quoteClusterId, config, now);
  console.log('quote-guard 결과:', quoteResult);
  if (quoteResult.status !== 'GUARDRAIL_BLOCKED') {
    console.error('✗ quote-guard가 원문 그대로 인용을 잡아내지 못함');
    process.exitCode = 1;
  } else {
    console.log('✓ 20자 초과 원문 인용 차단 확인');
  }

  await closeDb();
}

async function setupCapTestCluster(db: ReturnType<typeof getDb>): Promise<number> {
  const [source] = await db
    .select({ id: schema.newsSource.id })
    .from(schema.newsSource)
    .where(eq(schema.newsSource.name, 'fixture:태풍뉴스'));
  if (!source) throw new Error('fixture 소스 없음');

  const [article] = await db
    .insert(schema.newsArticle)
    .values({
      sourceId: source.id,
      url: 'https://fixture.local/articles/cap-test',
      title: '비용 상한 테스트 기사',
      publishedAt: now,
      simhash: 1,
    })
    .onConflictDoUpdate({ target: schema.newsArticle.url, set: { title: '비용 상한 테스트 기사' } })
    .returning({ id: schema.newsArticle.id });
  if (!article) throw new Error('news_article 생성 실패');

  const [cluster] = await db
    .insert(schema.newsCluster)
    .values({
      headline: '비용 상한 테스트 기사',
      tradeDate: '2026-08-21',
      firstSeenAt: now,
      lastSeenAt: now,
      articleCount: 1,
      representativeArticleId: article.id,
      analysisStatus: 'PENDING',
    })
    .returning({ id: schema.newsCluster.id });
  if (!cluster) throw new Error('news_cluster 생성 실패');

  await db
    .insert(schema.clusterArticle)
    .values({ clusterId: cluster.id, articleId: article.id })
    .onConflictDoNothing();
  return cluster.id;
}

main().catch((err) => {
  console.error('✗ 수동 검증 실패:', err);
  process.exit(1);
});
