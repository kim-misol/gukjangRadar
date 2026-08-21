/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-*.ts와 동일한 위치).
 *
 * docs/19-remaining-work.md §2(B6 반증검사, T2.3.5)를 실제 로컬 postgres에 대해 확인한다.
 * ANTHROPIC_API_KEY/DART_API_KEY 없이도, "AI 가속기" 엔티티(manual-verify-connections.ts와
 * 같은 recall 시나리오 — SK하이닉스/한미반도체가 SUPPLY_DICT로 recall된다)를 재사용해
 * fake LLM(회사매칭+반증검사 모두 처리) + fake DartClient로 확인한다.
 *
 * 확인 항목:
 *  1) BR≥60(오버라이드로 85) → 반증검사가 실제로 호출된다. SK하이닉스는 corp_code가 있어
 *     DartClient.fetchDisclosureList가 실제로 호출되고, refuted:true 응답이면
 *     businessRelevanceScore가 조정값으로 낮아지고 counterEvidence가 채워진다.
 *  2) 한미반도체는 corp_code가 없다(실 시드 데이터 확인함) — DartClient를 호출하지 않고도
 *     반증검사 LLM 호출은 진행되고(공시 없음 placeholder), refuted:false면 값이 그대로다.
 *  3) BR<60(오버라이드로 40)이면 반증검사 자체(DART 호출도 LLM 호출도)가 걸리지 않는다.
 *  4) 재실행 시 llm_run(stage=COUNTER)이 늘어나지 않는다(input_hash 캐시, 멱등성).
 *
 * 실행: pnpm manual-verify-counter-check
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import { and, eq } from 'drizzle-orm';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type {
  KeywordMatchConfig,
  MemeConfig,
  RecallConfig,
  ReviewTriggersConfig,
  ScoringConfig,
} from '@gukjang/core';
import type {
  AnthropicLlmClient,
  CallToolParams,
  CallToolResult,
} from '../apps/worker/src/llm/anthropic-client';
import type { DartClient } from '../apps/worker/src/collectors/dart-client';
import { findCandidatesForEntity } from '../apps/worker/src/connections/search-candidates';
import { buildConnectionsForCluster } from '../apps/worker/src/connections/build-connections';
import { referenceJudgementFor, fakeToolResult } from './lib/reference-judge';
import { setupClusterWithEntity } from './lib/fixtures';

const now = new Date('2026-08-21T10:00:00+09:00');
const MATCH_MODEL = 'claude-sonnet-5';

const baseConfig = {
  matchModel: MATCH_MODEL,
  dailyCostCapUsd: 20,
  recall: scoringConfig.recall as RecallConfig,
  keywordMatch: scoringConfig.keywordMatch as KeywordMatchConfig,
  meme: scoringConfig.meme as MemeConfig,
  scoring: scoringConfig as unknown as ScoringConfig,
  reviewTriggers: scoringConfig.reviewTriggers as ReviewTriggersConfig,
};

interface CannedCounterCheck {
  refuted: boolean;
  reason: string;
  adjusted_relevance: number;
}

/** MATCH(emit_judgements)와 COUNTER(emit_counter_check) 둘 다 처리하는 fake 클라이언트. */
function makeCombinedClient(
  candidates: readonly { companyId: number; recallRule: string }[],
  matchOverrides: ReadonlyMap<number, Record<string, unknown>>,
  counterCheckByTicker: ReadonlyMap<string, CannedCounterCheck>,
): { client: Pick<AnthropicLlmClient, 'callTool'>; counterCheckCallTickers: string[] } {
  const judgements = candidates.map((c) =>
    referenceJudgementFor(c.companyId, c.recallRule, matchOverrides.get(c.companyId) ?? {}),
  );
  const counterCheckCallTickers: string[] = [];
  const client: Pick<AnthropicLlmClient, 'callTool'> = {
    callTool: async <T>(params: CallToolParams<T>): Promise<CallToolResult<T>> => {
      if (params.tool.name === 'emit_counter_check') {
        const ticker = params.userContent.match(/\((\d{6})\)/)?.[1] ?? '';
        counterCheckCallTickers.push(ticker);
        const canned = counterCheckByTicker.get(ticker);
        if (!canned) throw new Error(`반증검사 canned 응답 없음: ticker=${ticker}`);
        const parsed = params.parseOutput(canned);
        if (!parsed.success) throw new Error(`반증검사 canned 응답 스키마 실패: ${parsed.error}`);
        return fakeToolResult(parsed.data);
      }
      const parsed = params.parseOutput({ judgements });
      if (!parsed.success) throw new Error(`reference judge 출력 스키마 실패: ${parsed.error}`);
      return fakeToolResult(parsed.data);
    },
  };
  return { client, counterCheckCallTickers };
}

function makeFakeDartClient(): {
  dartClient: Pick<DartClient, 'fetchDisclosureList'>;
  calledCorpCodes: string[];
} {
  const calledCorpCodes: string[] = [];
  return {
    calledCorpCodes,
    dartClient: {
      fetchDisclosureList: async (corpCode: string) => {
        calledCorpCodes.push(corpCode);
        return { status: '000', message: '정상', list: [{ report_nm: '분기보고서 (2026.Q3)' }] };
      },
    },
  };
}

async function main(): Promise<void> {
  const db = getDb();
  let failed = false;

  console.log('=== 1) BR≥60(85) — SK하이닉스(corp_code 있음): refuted:true로 조정 ===');
  const s1 = await setupClusterWithEntity(db, now, {
    urlSuffix: 'counter-check-refuted',
    headline: '엔비디아, 차세대 AI 가속기 공개 (반증검사 시나리오 1)',
    entityName: 'AI 가속기',
    entityKind: 'PRODUCT',
  });
  const s1Candidates = await findCandidatesForEntity(
    db,
    { id: s1.entityId, name: 'AI 가속기', kind: 'PRODUCT', nodeId: s1.entityNodeId },
    baseConfig.recall,
    baseConfig.keywordMatch,
  );
  const hynix1 = s1Candidates.find((c) => c.ticker === '000660');
  if (!hynix1) throw new Error('SK하이닉스 후보를 찾지 못함');
  const { dartClient: dart1, calledCorpCodes: dart1Calls } = makeFakeDartClient();
  const { client: client1, counterCheckCallTickers: cc1Calls } = makeCombinedClient(
    s1Candidates,
    new Map([[hynix1.companyId, { business_relevance: 85 }]]),
    new Map([
      [
        '000660',
        { refuted: true, reason: '반증검사: 근거가 확인되지 않습니다.', adjusted_relevance: 20 },
      ],
      ['042700', { refuted: false, reason: 'n/a', adjusted_relevance: 55 }],
    ]),
  );
  await buildConnectionsForCluster(
    db,
    client1,
    s1.clusterId,
    {
      ...baseConfig,
      counterCheck: { dartClient: dart1, model: MATCH_MODEL },
    },
    now,
  );
  const [hynixConn1] = await db
    .select({ br: schema.connection.businessRelevanceScore, ce: schema.connection.counterEvidence })
    .from(schema.connection)
    .where(
      and(
        eq(schema.connection.clusterId, s1.clusterId),
        eq(schema.connection.companyId, hynix1.companyId),
      ),
    );
  console.log('DartClient 호출:', dart1Calls, '| counter-check 호출 티커(이번 실행분):', cc1Calls);
  console.log('저장된 SK하이닉스 connection:', hynixConn1);
  // cc1Calls는 스크립트를 이미 한 번 돌린 적이 있으면 llm_run 캐시(input_hash)로 인해
  // 비어 있을 수 있다(정상 — §4가 바로 이 캐시 재사용을 검증한다) — 그래서 여기서는
  // 최종 DB 상태(br/ce)만으로 판정하고, 호출 여부는 참고 로그로만 남긴다.
  if (!dart1Calls.includes('10000003') || hynixConn1?.br !== 20 || !hynixConn1?.ce) {
    console.error(
      '✗ DoD 실패: refuted:true 반증검사가 businessRelevance/counterEvidence를 조정하지 못함',
    );
    failed = true;
  } else {
    console.log('✓ refuted:true → businessRelevanceScore 조정 + counterEvidence 기록 확인');
  }

  console.log(
    '\n=== 2) BR≥60(75, SUPPLY_DICT 기본값) — 한미반도체(corp_code 없음): refuted:false, DART 미호출 ===',
  );
  const hanmi1 = s1Candidates.find((c) => c.ticker === '042700');
  if (!hanmi1) throw new Error('한미반도체 후보를 찾지 못함');
  // 시나리오 1의 client1이 이미 candidates 전체(SK하이닉스+한미반도체)를 같은 클러스터에서
  // 함께 판정했다 — 한미반도체는 override 없이 SUPPLY_DICT 기본값(75)을 쓴다(75≥60이라
  // 반증검사는 걸리지만 corp_code가 없어 DART 호출 없이 진행된다).
  const [hanmiConn1] = await db
    .select({ br: schema.connection.businessRelevanceScore, ce: schema.connection.counterEvidence })
    .from(schema.connection)
    .where(
      and(
        eq(schema.connection.clusterId, s1.clusterId),
        eq(schema.connection.companyId, hanmi1.companyId),
      ),
    );
  console.log('저장된 한미반도체 connection:', hanmiConn1, '| DartClient 누적 호출:', dart1Calls);
  if (dart1Calls.length !== 1 || hanmiConn1?.br !== 75 || hanmiConn1?.ce !== null) {
    console.error('✗ DoD 실패: corp_code 없는 회사의 refuted:false 처리가 기대와 다름');
    failed = true;
  } else {
    console.log(
      '✓ corp_code 없어도 반증검사는 진행되고(공시 없음 placeholder), refuted:false면 원값 유지 · DART는 SK하이닉스 1건만 호출 확인',
    );
  }

  console.log('\n=== 3) BR<60(40)이면 반증검사 자체가 걸리지 않는다 ===');
  const s3 = await setupClusterWithEntity(db, now, {
    urlSuffix: 'counter-check-below-threshold',
    headline: '엔비디아, 차세대 AI 가속기 공개 (반증검사 시나리오 3)',
    entityName: 'AI 가속기',
    entityKind: 'PRODUCT',
  });
  const s3Candidates = await findCandidatesForEntity(
    db,
    { id: s3.entityId, name: 'AI 가속기', kind: 'PRODUCT', nodeId: s3.entityNodeId },
    baseConfig.recall,
    baseConfig.keywordMatch,
  );
  const { dartClient: dart3, calledCorpCodes: dart3Calls } = makeFakeDartClient();
  const { client: client3, counterCheckCallTickers: cc3Calls } = makeCombinedClient(
    s3Candidates,
    new Map(s3Candidates.map((c) => [c.companyId, { business_relevance: 40 }])),
    new Map(),
  );
  await buildConnectionsForCluster(
    db,
    client3,
    s3.clusterId,
    {
      ...baseConfig,
      counterCheck: { dartClient: dart3, model: MATCH_MODEL },
    },
    now,
  );
  console.log(
    'DartClient 호출 수:',
    dart3Calls.length,
    '| counter-check 호출 수:',
    cc3Calls.length,
  );
  if (dart3Calls.length !== 0 || cc3Calls.length !== 0) {
    console.error('✗ DoD 실패: BR<60인데 반증검사가 호출됨');
    failed = true;
  } else {
    console.log('✓ BR<60은 반증검사를 건너뜀 확인');
  }

  console.log('\n=== 4) 멱등성: 재실행해도 llm_run(stage=COUNTER)이 늘어나지 않는다 ===');
  const beforeCounterRuns = (
    await db.select().from(schema.llmRun).where(eq(schema.llmRun.stage, 'COUNTER'))
  ).length;
  const { dartClient: dart1b } = makeFakeDartClient();
  const { client: client1b } = makeCombinedClient(
    s1Candidates,
    new Map([[hynix1.companyId, { business_relevance: 85 }]]),
    new Map([
      ['000660', { refuted: true, reason: '재실행', adjusted_relevance: 20 }],
      ['042700', { refuted: false, reason: 'n/a', adjusted_relevance: 55 }],
    ]),
  );
  await buildConnectionsForCluster(
    db,
    client1b,
    s1.clusterId,
    {
      ...baseConfig,
      counterCheck: { dartClient: dart1b, model: MATCH_MODEL },
    },
    now,
  );
  const afterCounterRuns = (
    await db.select().from(schema.llmRun).where(eq(schema.llmRun.stage, 'COUNTER'))
  ).length;
  console.log(`llm_run(COUNTER): ${beforeCounterRuns} → ${afterCounterRuns}`);
  if (afterCounterRuns !== beforeCounterRuns) {
    console.error('✗ DoD 실패: 재실행 시 llm_run(COUNTER)이 중복 생성됨');
    failed = true;
  } else {
    console.log('✓ input_hash 캐시로 반증검사도 재실행 시 재호출되지 않음 확인');
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
