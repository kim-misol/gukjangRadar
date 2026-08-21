/**
 * T4.1 — 골든셋 러너 (docs/13-validation.md §5, §7 CI 게이트).
 * spec/golden/golden_set.jsonl의 각 케이스를 실제 로컬 postgres에 대해 돌리고
 * must_include/must_exclude/expect_type/br_range/score_range를 검증한다.
 *
 * ANTHROPIC_API_KEY가 있으면 실 LLM으로, 없으면 scripts/lib/reference-judge.ts의 결정론적
 * 대역으로 심사한다 — 대역 모드에서는 recall이 의도적으로 후보를 올리고 LLM의 REJECT만이
 * 진짜 오탐을 막는 케이스(needs_llm:true, 예: 신라/신라젠)를 NEEDS_LLM_REVIEW로 표시하고
 * 통과율 계산에서 제외한다(정직하게 "이건 이 모드로는 못 검증한다"고 보고하는 것).
 *
 * 실행: pnpm golden
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { closeDb, getDb, schema } from '@gukjang/db';
import { and, eq } from 'drizzle-orm';
import {
  loadEnv,
  normalizeName,
  parseGoldenSet,
  evaluateGoldenCase,
  type GoldenCase,
} from '@gukjang/core';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type {
  KeywordMatchConfig,
  MemeConfig,
  RecallConfig,
  ReviewTriggersConfig,
  ScoringConfig,
} from '@gukjang/core';
import { AnthropicLlmClient } from '../apps/worker/src/llm/anthropic-client';
import { findCandidatesForEntity } from '../apps/worker/src/connections/search-candidates';
import { buildConnectionsForCluster } from '../apps/worker/src/connections/build-connections';
import { ensureGraphNode } from '../apps/worker/src/graph/ensure-node';
import { makeReferenceJudgeClient } from './lib/reference-judge';

const PASS_RATE_THRESHOLD = 0.95; // docs/13 §5: "통과 기준 95%"
const now = new Date();

function loadGoldenSet(): GoldenCase[] {
  const requireFromHere = createRequire(import.meta.url);
  const filePath = requireFromHere.resolve('@gukjang/spec/golden/golden_set.jsonl');
  return parseGoldenSet(readFileSync(filePath, 'utf-8')).filter((c) => c.status === 'OK');
}

async function setupFixtureCluster(
  db: ReturnType<typeof getDb>,
  golden: GoldenCase,
): Promise<{ clusterId: number; entityId: number; entityNodeId: number } | null> {
  if (golden.anchorEntity.length === 0) return null; // G-104류: 개체 0개 케이스는 recall 대상이 없다

  const [source] = await db
    .insert(schema.newsSource)
    .values({ name: 'fixture:golden', domain: 'fixture.local', tier: 1, kind: 'RSS' })
    .onConflictDoUpdate({ target: schema.newsSource.name, set: { tier: 1 } })
    .returning({ id: schema.newsSource.id });
  if (!source) throw new Error('news_source 생성 실패');

  const url = `https://fixture.local/golden/${golden.id}`;
  const [article] = await db
    .insert(schema.newsArticle)
    .values({ sourceId: source.id, url, title: golden.headline, publishedAt: now, simhash: 0 })
    .onConflictDoUpdate({ target: schema.newsArticle.url, set: { title: golden.headline } })
    .returning({ id: schema.newsArticle.id });
  if (!article) throw new Error('news_article 생성 실패');

  const [cluster] = await db
    .insert(schema.newsCluster)
    .values({
      headline: golden.headline,
      aiSummary: `${golden.headline}. 관련 내용이 이어졌다. 시장의 관심이 모였다.`,
      tradeDate: '2026-08-21',
      firstSeenAt: now,
      lastSeenAt: now,
      articleCount: 1,
      representativeArticleId: article.id,
      analysisStatus: 'DONE',
    })
    .returning({ id: schema.newsCluster.id });
  if (!cluster) throw new Error('news_cluster 생성 실패');

  await db
    .insert(schema.clusterArticle)
    .values({ clusterId: cluster.id, articleId: article.id })
    .onConflictDoNothing();

  // W7에서 발견된 버그: 여기서 직접 공백만 지우면(예 "AI 가속기"→"AI가속기") concept.name_norm이
  // normalizeName()으로 소문자화까지 거친 값("ai가속기")과 대소문자가 달라 CONCEPT_MATCH가
  // 항상 실패했다 — SUPPLY_DICT 골든셋(G-003~G-009)이 깨끗한 DB에서 전부 떨어지는 원인이었다.
  // 다른 모든 곳(seed.ts 포함)과 같은 normalizeName()을 그대로 써야 한다.
  const nameNorm = normalizeName(golden.anchorEntity);
  const [entity] = await db
    .insert(schema.entity)
    .values({
      name: golden.anchorEntity,
      nameNorm,
      nameJamo: nameNorm,
      kind: 'WORD',
      mentionTotal: 1,
    })
    .onConflictDoUpdate({
      target: [schema.entity.nameNorm, schema.entity.kind],
      set: { mentionTotal: 1 },
    })
    .returning({ id: schema.entity.id });
  if (!entity) throw new Error('entity 생성 실패');

  const entityNodeId = await ensureGraphNode(db, 'ENTITY', entity.id, golden.anchorEntity);

  await db
    .insert(schema.newsEntity)
    .values({
      clusterId: cluster.id,
      entityId: entity.id,
      importance: '1',
      inHeadline: true,
      role: 'SUBJECT',
      mentionCount: 1,
    })
    .onConflictDoUpdate({
      target: [schema.newsEntity.clusterId, schema.newsEntity.entityId],
      set: { importance: '1' },
    });

  return { clusterId: cluster.id, entityId: entity.id, entityNodeId };
}

async function main(): Promise<void> {
  const env = loadEnv();
  const db = getDb();
  const golden = loadGoldenSet();
  const judgeIsReal = Boolean(env.ANTHROPIC_API_KEY);
  const realClient = judgeIsReal ? new AnthropicLlmClient({ apiKey: env.ANTHROPIC_API_KEY }) : null;

  console.log(
    `골든셋 케이스 ${golden.length}개 (status=OK) — judge=${judgeIsReal ? 'REAL(ANTHROPIC_API_KEY)' : 'reference(대역, needs_llm 케이스는 참고용)'}\n`,
  );

  const config = {
    matchModel: env.LLM_MATCH_MODEL,
    dailyCostCapUsd: env.LLM_DAILY_COST_CAP_USD,
    recall: scoringConfig.recall as RecallConfig,
    keywordMatch: scoringConfig.keywordMatch as KeywordMatchConfig,
    meme: scoringConfig.meme as MemeConfig,
    scoring: scoringConfig as unknown as ScoringConfig,
    reviewTriggers: scoringConfig.reviewTriggers as ReviewTriggersConfig,
  };

  const results: { id: string; outcome: string; reasons: string[] }[] = [];

  for (const c of golden) {
    const fixture = await setupFixtureCluster(db, c);
    if (!fixture) {
      // 개체 0개 케이스: must_include가 비어있는 한 자동으로 PASS (evaluateGoldenCase와 동일 규칙).
      const evalResult = evaluateGoldenCase(c, [], judgeIsReal);
      results.push(evalResult);
      continue;
    }

    const candidates = await findCandidatesForEntity(
      db,
      { id: fixture.entityId, name: c.anchorEntity, kind: 'WORD', nodeId: fixture.entityNodeId },
      config.recall,
      config.keywordMatch,
    );

    const client = realClient ?? makeReferenceJudgeClient(candidates);
    if (candidates.length > 0) {
      await buildConnectionsForCluster(db, client, fixture.clusterId, config, now);
    }

    const rows = await db
      .select({
        ticker: schema.company.ticker,
        type: schema.connection.connectionType,
        br: schema.connection.businessRelevanceScore,
        score: schema.connection.connectionScore,
      })
      .from(schema.connection)
      .innerJoin(schema.company, eq(schema.connection.companyId, schema.company.id))
      .where(
        and(
          eq(schema.connection.clusterId, fixture.clusterId),
          eq(schema.connection.status, 'ACTIVE'),
        ),
      );
    // PENDING(검수 대기)도 "만들어지긴 했다"는 뜻이라 must_include 판정엔 포함한다.
    const pendingRows = await db
      .select({
        ticker: schema.company.ticker,
        type: schema.connection.connectionType,
        br: schema.connection.businessRelevanceScore,
        score: schema.connection.connectionScore,
      })
      .from(schema.connection)
      .innerJoin(schema.company, eq(schema.connection.companyId, schema.company.id))
      .where(
        and(
          eq(schema.connection.clusterId, fixture.clusterId),
          eq(schema.connection.status, 'PENDING'),
        ),
      );

    const observed = [...rows, ...pendingRows].map((r) => ({
      ticker: r.ticker,
      type: r.type,
      businessRelevance: r.br,
      connectionScore: r.score,
    }));

    results.push(evaluateGoldenCase(c, observed, judgeIsReal));
  }

  console.log('결과:');
  for (const r of results) {
    const mark = r.outcome === 'PASS' ? '✓' : r.outcome === 'NEEDS_LLM_REVIEW' ? '△' : '✗';
    console.log(
      `  ${mark} ${r.id} — ${r.outcome}${r.reasons.length ? '\n      ' + r.reasons.join('\n      ') : ''}`,
    );
  }

  const scored = results.filter((r) => r.outcome !== 'NEEDS_LLM_REVIEW');
  const passed = scored.filter((r) => r.outcome === 'PASS').length;
  const needsLlmReview = results.length - scored.length;
  const passRate = scored.length > 0 ? passed / scored.length : 1;

  console.log(
    `\n통과: ${passed}/${scored.length} (${(passRate * 100).toFixed(1)}%)` +
      (needsLlmReview > 0
        ? `, NEEDS_LLM_REVIEW: ${needsLlmReview}건(대역 판정기 한계, 통과율 계산 제외)`
        : ''),
  );

  await closeDb();
  if (passRate < PASS_RATE_THRESHOLD) {
    console.error(`✗ 골든셋 통과율이 기준(${PASS_RATE_THRESHOLD * 100}%) 미만`);
    process.exit(1);
  }
  console.log('✓ 골든셋 통과');
}

main().catch((err) => {
  console.error('✗ 골든셋 러너 실패:', err);
  process.exit(1);
});
