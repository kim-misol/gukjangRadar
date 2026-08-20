/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님).
 * 실 DART 네트워크가 막혀 있어(W1/W2 기록) 진짜 DartClient 대신 픽스처 응답을
 * 반환하는 fake client로 syncBusinessSummaries/syncAffiliationEdges를 **실제
 * 로컬 postgres**에 대해 돌려 T1.2.2/T1.2.3 DoD가 실제로 동작하는지 확인한다.
 *
 * 실행: pnpm --filter @gukjang/db exec tsx ../../scripts/manual-verify-dart-sync.ts
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import { eq } from 'drizzle-orm';
import { syncBusinessSummaries } from '../apps/worker/src/collectors/sync-business-summary';
import { syncAffiliationEdges } from '../apps/worker/src/collectors/sync-affiliation-edges';
import type { DartCompanyOverviewResponse, DartMajorShareholderRow } from '@gukjang/core';

const OVERVIEW_FIXTURES: Record<string, DartCompanyOverviewResponse> = {
  '10000001': {
    status: '000',
    message: '정상',
    corp_name: '노루페인트',
    ceo_nm: '한영재',
    est_dt: '19450101',
  },
  '00126380': {
    status: '000',
    message: '정상',
    corp_name: '노루홀딩스',
    ceo_nm: '한영재',
    est_dt: '19450101',
  },
  '10000003': {
    status: '000',
    message: '정상',
    corp_name: 'SK하이닉스',
    ceo_nm: '곽노정',
    est_dt: '19491015',
  },
};

const SHAREHOLDER_FIXTURES: Record<string, DartMajorShareholderRow[]> = {
  // docs/06-erd.md §3 예시 재현: 노루페인트의 최대주주는 노루홀딩스.
  '10000001': [
    { nm: '(주)노루홀딩스', relate: '본인', trmend_posesn_stock_qota_rt: '45.31' },
    { nm: '홍길동', relate: '특수관계인', trmend_posesn_stock_qota_rt: '2.10' },
  ],
};

async function main(): Promise<void> {
  const db = getDb();

  const fakeDartClient = {
    fetchCompanyOverview: async (corpCode: string): Promise<DartCompanyOverviewResponse> =>
      OVERVIEW_FIXTURES[corpCode] ?? { status: '013', message: '데이터 없음' },
    fetchMajorShareholders: async (corpCode: string): Promise<DartMajorShareholderRow[]> =>
      SHAREHOLDER_FIXTURES[corpCode] ?? [],
  };

  console.log('=== T1.2.2 business_summary 동기화 (fake DART client) ===');
  const summaryResult = await syncBusinessSummaries(db, fakeDartClient);
  console.log(summaryResult);

  const [noru] = await db
    .select({ name: schema.company.name, businessSummary: schema.company.businessSummary })
    .from(schema.company)
    .where(eq(schema.company.ticker, '090350'));
  console.log(`노루페인트.business_summary = "${noru?.businessSummary}"`);

  console.log('\n=== T1.2.2 캐시 확인: 두 번째 실행은 전부 skippedFresh여야 함 ===');
  const secondRun = await syncBusinessSummaries(db, fakeDartClient);
  console.log(secondRun);

  console.log('\n=== T1.2.3 AFFILIATION 엣지 동기화 (fake DART client) ===');
  const edgeResult = await syncAffiliationEdges(db, fakeDartClient, '2025');
  console.log(edgeResult);

  const rows = await db
    .select({
      srcLabel: schema.graphNode.label,
      edgeType: schema.graphEdge.edgeType,
      weight: schema.graphEdge.weight,
      confidence: schema.graphEdge.confidence,
      evidence: schema.graphEdge.evidence,
    })
    .from(schema.graphEdge)
    .innerJoin(schema.graphNode, eq(schema.graphEdge.srcNodeId, schema.graphNode.id))
    .where(eq(schema.graphEdge.edgeType, 'AFFILIATION'));

  console.log('생성된 AFFILIATION 엣지:');
  for (const row of rows) {
    console.log(
      `  ${row.srcLabel} --[${row.edgeType} w=${row.weight} c=${row.confidence}]--> `,
      row.evidence,
    );
  }

  await closeDb();
}

main().catch((err) => {
  console.error('✗ 수동 검증 실패:', err);
  process.exit(1);
});
