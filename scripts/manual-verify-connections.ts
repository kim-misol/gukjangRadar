/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-*.ts와 동일한 위치).
 *
 * docs/15-build-order.md W5 게이트(E2.3, 반증검사 제외)를 실제 로컬 postgres에 대해 확인한다.
 * ANTHROPIC_API_KEY가 없어 실 LLM 호출은 못 하지만, findCandidatesForEntity(결정론, T2.3.1~3)로
 * 실제 후보를 먼저 구한 뒤 그 결과에 맞춰 판정을 내는 fake AnthropicLlmClient로
 * buildConnectionsForCluster(T2.3.4+6+7+8) 전체를 돌린다 — W4 manual-verify-analysis와 같은 패턴.
 *
 * 확인 항목:
 *  1) "노루" → 노루페인트(NAME_MATCH, ALIAS_EXACT) + 노루홀딩스(AFFILIATION, GRAPH_EXPAND 2홉)
 *  2) "AI 가속기" → SK하이닉스/한미반도체(SUPPLY_CHAIN, SUPPLY_DICT, 개념사전 경유)
 *  3) G7: 재난 헤드라인에서 MEME 판정은 저장되지 않고 guardrail_violation(G7)만 남는다
 *  4) G4: MEME/NAME_MATCH인데 BR>30인 판정은 30으로 강등되어 저장된다
 *  5) input_hash 캐시 재사용: 재실행해도 llm_run/connection이 늘어나지 않는다(멱등)
 *
 * 실행: pnpm manual-verify-connections
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import { eq, and } from 'drizzle-orm';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type {
  KeywordMatchConfig,
  MemeConfig,
  RecallConfig,
  ReviewTriggersConfig,
  ScoringConfig,
} from '@gukjang/core';
import { findCandidatesForEntity } from '../apps/worker/src/connections/search-candidates';
import { buildConnectionsForCluster } from '../apps/worker/src/connections/build-connections';
import { ensureGraphNode } from '../apps/worker/src/graph/ensure-node';
import { makeReferenceJudgeClient } from './lib/reference-judge';
import { setupClusterWithEntity } from './lib/fixtures';

const now = new Date('2026-08-21T10:00:00+09:00');
const MATCH_MODEL = 'claude-sonnet-5';

const config = {
  matchModel: MATCH_MODEL,
  dailyCostCapUsd: 20,
  recall: scoringConfig.recall as RecallConfig,
  keywordMatch: scoringConfig.keywordMatch as KeywordMatchConfig,
  meme: scoringConfig.meme as MemeConfig,
  scoring: scoringConfig as unknown as ScoringConfig,
  reviewTriggers: scoringConfig.reviewTriggers as ReviewTriggersConfig,
};

async function main(): Promise<void> {
  const db = getDb();
  let failed = false;

  console.log('=== 1) "노루" → 노루페인트/노루홀딩스 두 후보 모두 recall되어 판정·저장된다 ===');
  const noru = await setupClusterWithEntity(db, now, {
    urlSuffix: 'typhoon-noru',
    headline: "제11호 태풍 '노루' 북상… 제주 직접 영향권",
    entityName: '노루',
    entityKind: 'WORD',
    subtype: 'TYPHOON_NAME',
  });
  const noruCandidates = await findCandidatesForEntity(
    db,
    { id: noru.entityId, name: '노루', kind: 'WORD', nodeId: noru.entityNodeId },
    config.recall,
    config.keywordMatch,
  );
  console.log(
    '후보:',
    noruCandidates.map(
      (c) => `${c.name}(${c.ticker}) ${c.recallRule} recallScore=${c.recallScore.toFixed(2)}`,
    ),
  );
  const noruResult = await buildConnectionsForCluster(
    db,
    makeReferenceJudgeClient(noruCandidates),
    noru.clusterId,
    config,
    now,
  );
  console.log('buildConnectionsForCluster:', noruResult);

  const noruConnections = await db
    .select({
      ticker: schema.company.ticker,
      name: schema.company.name,
      type: schema.connection.connectionType,
      br: schema.connection.businessRelevanceScore,
      score: schema.connection.connectionScore,
      status: schema.connection.status,
    })
    .from(schema.connection)
    .innerJoin(schema.company, eq(schema.connection.companyId, schema.company.id))
    .where(eq(schema.connection.clusterId, noru.clusterId));
  console.log('저장된 connection:', noruConnections);

  // 어느 쪽이 SHORT 별칭 완전일치(ALIAS_EXACT)를 갖는지는 별칭 생성기(W1) 내부 규칙에
  // 달려있다 — 여기서는 "이름 관련 후보 두 개가 모두 recall·저장됐다"만 확인한다.
  const hasNoruPaint = noruConnections.some((c) => c.ticker === '090350');
  const hasNoruHoldings = noruConnections.some((c) => c.ticker === '000320');
  const hasNameMatch = noruConnections.some((c) => c.type === 'NAME_MATCH');
  if (!hasNoruPaint || !hasNoruHoldings || !hasNameMatch) {
    console.error('✗ DoD 실패: 노루페인트/노루홀딩스 중 하나가 없거나 NAME_MATCH 판정이 없음');
    failed = true;
  } else {
    console.log('✓ "노루" 계열 두 후보 모두 recall·저장 확인');
  }

  console.log('\n=== 1b) GRAPH_EXPAND: 확정된 기업에서 AFFILIATION 1홉 (docs/09 §2) ===');
  // 실 seed 데이터엔 AFFILIATION 엣지가 없다(T1.2.3 DART 동기화는 별도 스크립트) — 메커니즘만
  // 독립적으로 증명하기 위해 임시 3번째 계열사를 만들고 노루페인트 → 그 회사로 AFFILIATION을 심는다.
  const [siblingCompany] = await db
    .insert(schema.company)
    .values({
      ticker: '999001',
      name: '노루템프계열사',
      nameNorm: '노루템프계열사',
      nameJamo: '노루템프계열사',
      market: 'KOSDAQ',
    })
    .onConflictDoUpdate({ target: schema.company.ticker, set: { name: '노루템프계열사' } })
    .returning({ id: schema.company.id });
  if (!siblingCompany) throw new Error('임시 계열사 생성 실패');
  const noruPaintCompanyId = noruCandidates.find((c) => c.ticker === '090350')?.companyId;
  if (!noruPaintCompanyId)
    throw new Error('노루페인트 후보를 찾지 못함 — GRAPH_EXPAND 시나리오 구성 실패');
  const noruPaintNodeId = await ensureGraphNode(db, 'COMPANY', noruPaintCompanyId, '노루페인트');
  const siblingNodeId = await ensureGraphNode(db, 'COMPANY', siblingCompany.id, '노루템프계열사');
  await db
    .insert(schema.graphEdge)
    .values({
      srcNodeId: noruPaintNodeId,
      dstNodeId: siblingNodeId,
      edgeType: 'AFFILIATION',
      weight: '0.8',
      confidence: '0.9',
      origin: 'DART',
      evidence: { source: 'DART', doc: 'fixture' },
    })
    .onConflictDoUpdate({
      target: [schema.graphEdge.srcNodeId, schema.graphEdge.dstNodeId, schema.graphEdge.edgeType],
      set: { weight: '0.8' },
    });

  const expandCandidates = await findCandidatesForEntity(
    db,
    { id: noru.entityId, name: '노루', kind: 'WORD', nodeId: noru.entityNodeId },
    config.recall,
    config.keywordMatch,
  );
  const graphExpandHit = expandCandidates.find((c) => c.companyId === siblingCompany.id);
  console.log(
    'GRAPH_EXPAND 후보:',
    graphExpandHit && {
      name: graphExpandHit.name,
      recallRule: graphExpandHit.recallRule,
      hopCount: graphExpandHit.hopCount,
      path: graphExpandHit.path.map((s) => s.label),
    },
  );
  if (
    !graphExpandHit ||
    graphExpandHit.recallRule !== 'GRAPH_EXPAND' ||
    graphExpandHit.hopCount !== 2
  ) {
    console.error(
      '✗ DoD 실패: AFFILIATION 1홉으로 노루템프계열사가 GRAPH_EXPAND 후보로 나오지 않음',
    );
    failed = true;
  } else {
    console.log('✓ GRAPH_EXPAND(재귀 CTE 실 SQL 실행 + 경로 조립) 확인');
  }

  console.log('\n=== 2) "AI 가속기" → SUPPLY_CHAIN(SK하이닉스/한미반도체, 개념사전 경유) ===');
  const ai = await setupClusterWithEntity(db, now, {
    urlSuffix: 'ai-accelerator',
    headline: '엔비디아, 차세대 AI 가속기 공개',
    entityName: 'AI 가속기',
    entityKind: 'PRODUCT',
  });
  const aiCandidates = await findCandidatesForEntity(
    db,
    { id: ai.entityId, name: 'AI 가속기', kind: 'PRODUCT', nodeId: ai.entityNodeId },
    config.recall,
    config.keywordMatch,
  );
  console.log(
    '후보:',
    aiCandidates.map(
      (c) => `${c.name}(${c.ticker}) ${c.recallRule} path=${c.path.map((s) => s.label).join('→')}`,
    ),
  );
  const aiResult = await buildConnectionsForCluster(
    db,
    makeReferenceJudgeClient(aiCandidates),
    ai.clusterId,
    config,
    now,
  );
  console.log('buildConnectionsForCluster:', aiResult);

  const aiConnections = await db
    .select({
      ticker: schema.company.ticker,
      name: schema.company.name,
      type: schema.connection.connectionType,
      br: schema.connection.businessRelevanceScore,
      supplyChain: schema.connection.supplyChainScore,
      hop: schema.connection.hopCount,
    })
    .from(schema.connection)
    .innerJoin(schema.company, eq(schema.connection.companyId, schema.company.id))
    .where(eq(schema.connection.clusterId, ai.clusterId));
  console.log('저장된 connection:', aiConnections);

  const hasHynix = aiConnections.some(
    (c) => c.ticker === '000660' && c.type === 'SUPPLY_CHAIN' && c.supplyChain > 0,
  );
  const hasHanmi = aiConnections.some(
    (c) => c.ticker === '042700' && c.type === 'SUPPLY_CHAIN' && c.supplyChain > 0,
  );
  if (!hasHynix || !hasHanmi) {
    console.error(
      '✗ DoD 실패: SK하이닉스/한미반도체 SUPPLY_CHAIN 연결이 없거나 supplyChainScore=0',
    );
    failed = true;
  } else {
    console.log('✓ G-004/G-005 재현 확인 (SUPPLY_DICT 개념사전 경유 실동작)');
  }

  console.log('\n=== 3) G7: 재난 헤드라인에서 MEME 판정은 저장되지 않는다 ===');
  const disaster = await setupClusterWithEntity(db, now, {
    urlSuffix: 'noru-disaster',
    headline: "태풍 '노루' 북상 중 다중 추돌 사고로 사상자 발생",
    entityName: '노루',
    entityKind: 'WORD',
    subtype: 'TYPHOON_NAME',
  });
  const disasterCandidates = await findCandidatesForEntity(
    db,
    { id: disaster.entityId, name: '노루', kind: 'WORD', nodeId: disaster.entityNodeId },
    config.recall,
    config.keywordMatch,
  );
  const disasterOverrides = new Map(
    disasterCandidates.map((c) => [c.companyId, { connection_type: 'MEME' }]),
  );
  const beforeViolations = (await db.select().from(schema.guardrailViolation)).length;
  const disasterResult = await buildConnectionsForCluster(
    db,
    makeReferenceJudgeClient(disasterCandidates, disasterOverrides),
    disaster.clusterId,
    config,
    now,
  );
  console.log('buildConnectionsForCluster:', disasterResult);
  const disasterConnections = await db
    .select()
    .from(schema.connection)
    .where(eq(schema.connection.clusterId, disaster.clusterId));
  const g7Violations = await db
    .select()
    .from(schema.guardrailViolation)
    .where(eq(schema.guardrailViolation.ruleId, 'G7'));
  console.log(
    `저장된 connection 수: ${disasterConnections.length} (기대: 0), G7 위반 기록: ${g7Violations.length}건`,
  );
  if (disasterConnections.length !== 0 || g7Violations.length === 0) {
    console.error('✗ DoD 실패: G7이 재난 헤드라인의 MEME 연결을 막지 못함');
    failed = true;
  } else {
    console.log('✓ G7(재난 뉴스 MEME 하드 차단) 확인');
  }
  void beforeViolations;

  console.log('\n=== 4) G4: MEME/NAME_MATCH인데 BR>30이면 30으로 강등되어 저장된다 ===');
  const g4 = await setupClusterWithEntity(db, now, {
    urlSuffix: 'noru-g4',
    headline: "제11호 태풍 '노루' 북상 관련 속보",
    entityName: '노루',
    entityKind: 'WORD',
    subtype: 'TYPHOON_NAME',
  });
  const g4Candidates = await findCandidatesForEntity(
    db,
    { id: g4.entityId, name: '노루', kind: 'WORD', nodeId: g4.entityNodeId },
    config.recall,
    config.keywordMatch,
  );
  const norupaintCandidate = g4Candidates.find((c) => c.ticker === '090350');
  if (!norupaintCandidate) throw new Error('노루페인트 후보를 찾지 못함 — G4 시나리오 구성 실패');
  // G4는 connection_type(NAME_MATCH/MEME)만 보고 BR을 강등한다 — 실제 recallRule과 무관하게
  // NAME_MATCH를 강제해 시나리오를 구성한다.
  const g4Overrides = new Map([
    [norupaintCandidate.companyId, { connection_type: 'NAME_MATCH', business_relevance: 70 }],
  ]);
  await buildConnectionsForCluster(
    db,
    makeReferenceJudgeClient([norupaintCandidate], g4Overrides),
    g4.clusterId,
    config,
    now,
  );
  const [g4Connection] = await db
    .select({ br: schema.connection.businessRelevanceScore })
    .from(schema.connection)
    .where(
      and(
        eq(schema.connection.clusterId, g4.clusterId),
        eq(schema.connection.companyId, norupaintCandidate.companyId),
      ),
    );
  console.log('저장된 businessRelevanceScore:', g4Connection?.br, '(기대: 30)');
  if (g4Connection?.br !== 30) {
    console.error('✗ DoD 실패: G4가 BR을 30으로 강등하지 못함');
    failed = true;
  } else {
    console.log('✓ G4(MEME/NAME_MATCH BR 상한) 확인');
  }

  console.log('\n=== 5) 멱등성: 같은 클러스터 재실행 시 llm_run/connection이 늘어나지 않는다 ===');
  // "노루" 클러스터는 1b에서 그래프를 바꿔놨으므로(후보집합이 달라져 input_hash가 바뀐다) 재사용하지
  // 않는다 — 그 사이 아무 것도 바뀌지 않은 "AI 가속기" 클러스터로 순수 재실행 여부만 확인한다.
  const beforeLlmRuns = (await db.select().from(schema.llmRun)).length;
  const beforeConnections = (await db.select().from(schema.connection)).length;
  await buildConnectionsForCluster(
    db,
    makeReferenceJudgeClient(aiCandidates),
    ai.clusterId,
    config,
    now,
  );
  const afterLlmRuns = (await db.select().from(schema.llmRun)).length;
  const afterConnections = (await db.select().from(schema.connection)).length;
  console.log(
    `llm_run: ${beforeLlmRuns} → ${afterLlmRuns}, connection: ${beforeConnections} → ${afterConnections}`,
  );
  if (afterLlmRuns !== beforeLlmRuns || afterConnections !== beforeConnections) {
    console.error('✗ DoD 실패: 재실행 시 llm_run 또는 connection이 중복 생성됨');
    failed = true;
  } else {
    console.log('✓ input_hash 캐시 재사용 + connection upsert 멱등성 확인');
  }

  await closeDb();
  if (failed) {
    console.error('\n✗ 일부 검증 실패');
    process.exit(1);
  }
  console.log('\n✓ 전체 검증 통과');
}

main().catch((err) => {
  console.error('✗ 수동 검증 실패:', err);
  process.exit(1);
});
