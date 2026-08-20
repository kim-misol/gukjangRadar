/**
 * T1.2.3 — DART 최대주주 현황 → AFFILIATION 엣지 생성.
 * DoD: docs/06-erd.md §3 예시(노루페인트 → 노루홀딩스, type=AFFILIATION,
 * evidence={"source":"DART",...})를 실제 seed 데이터로 재현한다.
 *
 * graph_edge는 "세상에 대한 사실"이므로(docs/06-erd.md D-C) 매 실행마다
 * 새로 만들지 않고 upsert한다 — DART 공시가 갱신되면 weight/evidence만 최신화.
 *
 * 실행: pnpm --filter @gukjang/worker exec tsx src/collectors/sync-affiliation-edges.ts
 */
import { normalizeName, resolveAffiliationCandidates } from '@gukjang/core';
import type { KnownCompany } from '@gukjang/core';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { and, eq } from 'drizzle-orm';
import { DartClient } from './dart-client';

export interface AffiliationSyncResult {
  scanned: number;
  edgesUpserted: number;
  skippedNoCorpCode: number;
  skippedNoData: number;
}

/** company.id ↔ graph_node.id 매핑을 만들되, 없으면 만든다 (kind=COMPANY). */
async function ensureCompanyNode(
  db: ReturnType<typeof getDb>,
  companyId: number,
  label: string,
): Promise<number> {
  const isThisCompanyNode = and(
    eq(schema.graphNode.kind, 'COMPANY'),
    eq(schema.graphNode.refId, companyId),
  );

  const [existing] = await db
    .select({ id: schema.graphNode.id })
    .from(schema.graphNode)
    .where(isThisCompanyNode);
  if (existing) return existing.id;

  const [inserted] = await db
    .insert(schema.graphNode)
    .values({ kind: 'COMPANY', refId: companyId, label })
    .onConflictDoNothing({ target: [schema.graphNode.kind, schema.graphNode.refId] })
    .returning({ id: schema.graphNode.id });
  if (inserted) return inserted.id;

  // onConflictDoNothing이 아무것도 반환하지 않은 경우(동시 실행 등) 재조회.
  const [row] = await db
    .select({ id: schema.graphNode.id })
    .from(schema.graphNode)
    .where(isThisCompanyNode);
  if (!row) throw new Error(`graph_node 생성/조회 실패: company #${companyId}`);
  return row.id;
}

export async function syncAffiliationEdges(
  db: ReturnType<typeof getDb>,
  client: Pick<DartClient, 'fetchMajorShareholders'>,
  bsnsYear: string,
): Promise<AffiliationSyncResult> {
  const companies = await db
    .select({
      id: schema.company.id,
      name: schema.company.name,
      corpCode: schema.company.corpCode,
    })
    .from(schema.company);

  const knownCompanies: KnownCompany[] = companies.map((c) => ({
    companyId: c.id,
    nameNorm: normalizeName(c.name),
  }));

  let edgesUpserted = 0;
  let skippedNoCorpCode = 0;
  let skippedNoData = 0;

  for (const c of companies) {
    if (!c.corpCode) {
      skippedNoCorpCode++;
      continue;
    }

    const shareholders = await client.fetchMajorShareholders(c.corpCode, bsnsYear);
    if (!shareholders || shareholders.length === 0) {
      skippedNoData++;
      continue;
    }

    const candidates = resolveAffiliationCandidates(shareholders, knownCompanies, c.id);
    if (candidates.length === 0) continue;

    const srcNodeId = await ensureCompanyNode(db, c.id, c.name);

    for (const candidate of candidates) {
      const related = companies.find((x) => x.id === candidate.relatedCompanyId);
      if (!related) continue;
      const dstNodeId = await ensureCompanyNode(db, related.id, related.name);

      await db
        .insert(schema.graphEdge)
        .values({
          srcNodeId,
          dstNodeId,
          edgeType: 'AFFILIATION',
          weight: candidate.weight.toString(),
          confidence: candidate.confidence.toString(),
          origin: 'DART',
          evidence: {
            source: 'DART',
            corp_code: c.corpCode,
            doc: '최대주주현황',
            relate: candidate.relate,
            stake_percent: candidate.stakePercent,
          },
        })
        .onConflictDoUpdate({
          target: [
            schema.graphEdge.srcNodeId,
            schema.graphEdge.dstNodeId,
            schema.graphEdge.edgeType,
          ],
          set: {
            weight: candidate.weight.toString(),
            confidence: candidate.confidence.toString(),
            evidence: {
              source: 'DART',
              corp_code: c.corpCode,
              doc: '최대주주현황',
              relate: candidate.relate,
              stake_percent: candidate.stakePercent,
            },
          },
        });
      edgesUpserted++;
    }
  }

  return { scanned: companies.length, edgesUpserted, skippedNoCorpCode, skippedNoData };
}

async function main(): Promise<void> {
  const { loadEnv } = await import('@gukjang/core');
  const { getDb: getDbFn, closeDb } = await import('@gukjang/db');
  const env = loadEnv();
  if (!env.DART_API_KEY) {
    console.error('✗ DART_API_KEY가 설정되지 않음 — .env를 확인할 것');
    process.exit(1);
  }
  const db = getDbFn();
  const client = new DartClient({ apiKey: env.DART_API_KEY });
  const bsnsYear = String(new Date().getFullYear() - 1);
  console.log(`AFFILIATION 엣지 동기화 시작… (bsns_year=${bsnsYear})`);
  const result = await syncAffiliationEdges(db, client, bsnsYear);
  console.log(
    `✓ 완료 — scanned=${result.scanned} edgesUpserted=${result.edgesUpserted} ` +
      `skippedNoCorpCode=${result.skippedNoCorpCode} skippedNoData=${result.skippedNoData}`,
  );
  await closeDb();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('✗ AFFILIATION 엣지 동기화 실패:', err);
    process.exit(1);
  });
}
