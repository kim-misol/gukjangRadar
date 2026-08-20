/**
 * W2 게이트 검증 — docs/15-build-order.md W2:
 *   "콘솔 스크립트로 `노루` → 노루페인트/노루홀딩스, `원희` → 원익 후보가 나오는지 확인."
 *
 * LLM은 한 줄도 쓰지 않는다. packages/core의 순수 함수(normalizeName/toJamo/
 * jamoSimilarity/sharesFirstSyllable)와 시드된 company_alias만으로 후보가
 * 실제로 나오는지 눈으로 확인하기 위한 콘솔 스크립트다.
 *
 * 여기 구현한 3개 규칙(ALIAS_EXACT/ALIAS_PREFIX/ALIAS_JAMO_SIMILAR)은
 * docs/09-prompt-company-matching.md §2의 표를 그대로 따른 것이며, Recall 룰
 * 8종 전체(T2.3.1, E2 주차)를 앞당겨 구현한 것은 아니다 — 이 스크립트는 오직
 * "핵심 마법"이 지금 이 데이터로 실제 동작하는지를 증명하는 용도다.
 *
 * 실행 (repo root): pnpm verify-name-index
 */
import { jamoSimilarity, normalizeName, sharesFirstSyllable } from '@gukjang/core';
import { closeDb, getDb, schema } from '@gukjang/db';
import { eq } from 'drizzle-orm';

/** docs/09 §2: 자모 유사도 ≥ 0.6 이면 ALIAS_JAMO_SIMILAR. */
const JAMO_SIM_THRESHOLD = 0.6;

type RecallRule = 'ALIAS_EXACT' | 'ALIAS_PREFIX' | 'ALIAS_JAMO_SIMILAR';

interface Candidate {
  companyName: string;
  alias: string;
  aliasType: string;
  recallRule: RecallRule;
  score: number;
}

interface AliasRow {
  companyName: string;
  alias: string;
  aliasNorm: string;
  aliasType: string;
}

/**
 * docs/09-prompt-company-matching.md §2 표의 ALIAS_EXACT / ALIAS_PREFIX /
 * ALIAS_JAMO_SIMILAR 세 룰만 순수 함수로 재현한다. company_alias 전체를
 * 스캔하는 단순 구현 — 실제 Recall 엔진(T2.3.1)은 인덱스/상한/8종 룰을 갖춘다.
 */
function recallFromAliasRows(query: string, rows: AliasRow[]): Candidate[] {
  const queryNorm = normalizeName(query);
  const candidates: Candidate[] = [];

  for (const row of rows) {
    // ALIAS_EXACT — docs 예: 노루 → 노루페인트(의 SHORT 별칭 "노루")
    if (row.aliasNorm === queryNorm) {
      candidates.push({
        companyName: row.companyName,
        alias: row.alias,
        aliasType: row.aliasType,
        recallRule: 'ALIAS_EXACT',
        score: 1.0,
      });
      continue;
    }

    // ALIAS_PREFIX — 별칭이 질의로 시작하거나 질의가 별칭으로 시작 (2자 이상)
    const minLen = Math.min(row.aliasNorm.length, queryNorm.length);
    const isPrefixMatch =
      minLen >= 2 && (row.aliasNorm.startsWith(queryNorm) || queryNorm.startsWith(row.aliasNorm));
    if (isPrefixMatch) {
      candidates.push({
        companyName: row.companyName,
        alias: row.alias,
        aliasType: row.aliasType,
        recallRule: 'ALIAS_PREFIX',
        score: 0.55,
      });
      continue;
    }

    // ALIAS_JAMO_SIMILAR — sim ≥ 0.6, 또는 0.6 미만이라도 첫 음절이 같으면
    // ALIAS_PREFIX 병합 규칙으로 그대로 후보에 올린다 (docs §2 "자모 유사도" 절).
    const sim = jamoSimilarity(queryNorm, row.aliasNorm);
    if (sim >= JAMO_SIM_THRESHOLD) {
      candidates.push({
        companyName: row.companyName,
        alias: row.alias,
        aliasType: row.aliasType,
        recallRule: 'ALIAS_JAMO_SIMILAR',
        score: 0.35 + sim * 0.4, // 0.6→0.59 ~ 1.0→0.75 구간으로 문서의 "0.35~0.75" 범위에 맞춤
      });
    } else if (sharesFirstSyllable(query, row.alias)) {
      candidates.push({
        companyName: row.companyName,
        alias: row.alias,
        aliasType: row.aliasType,
        recallRule: 'ALIAS_PREFIX',
        score: 0.55,
      });
    }
  }

  // 회사당 최고 점수 후보 하나만 남기고, 점수 내림차순 정렬.
  const bestByCompany = new Map<string, Candidate>();
  for (const c of candidates) {
    const existing = bestByCompany.get(c.companyName);
    if (!existing || c.score > existing.score) bestByCompany.set(c.companyName, c);
  }
  return [...bestByCompany.values()].sort((a, b) => b.score - a.score);
}

async function findCandidates(query: string): Promise<Candidate[]> {
  const db = getDb();
  const rows = await db
    .select({
      companyName: schema.company.name,
      alias: schema.companyAlias.alias,
      aliasNorm: schema.companyAlias.aliasNorm,
      aliasType: schema.companyAlias.aliasType,
    })
    .from(schema.companyAlias)
    .innerJoin(schema.company, eq(schema.companyAlias.companyId, schema.company.id));

  return recallFromAliasRows(query, rows);
}

async function main(): Promise<void> {
  const queries = ['노루', '원희'];
  for (const query of queries) {
    const candidates = await findCandidates(query);
    console.log(`\n질의: "${query}"`);
    if (candidates.length === 0) {
      console.log('  (후보 없음)');
      continue;
    }
    for (const c of candidates) {
      console.log(
        `  - ${c.companyName.padEnd(10, ' ')} ← "${c.alias}" (${c.aliasType}) ` +
          `[${c.recallRule}] score=${c.score.toFixed(2)}`,
      );
    }
  }
  await closeDb();
}

main().catch((err) => {
  console.error('✗ 검증 스크립트 실패:', err);
  process.exit(1);
});
