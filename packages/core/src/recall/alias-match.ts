/**
 * T2.3.1 — ALIAS_EXACT / ALIAS_PREFIX / ALIAS_JAMO_SIMILAR 세 룰 (docs/09 §2).
 * scripts/verify-name-index.ts(W2 게이트 검증 스크립트)에서 증명된 로직을 실제 엔진으로 승격한 것.
 * 순수 함수, IO 없음 (R7) — company_alias 스캔은 apps/worker가 하고 결과 행만 받는다.
 */
import { normalizeName } from '../normalize/hangul';
import { jamoSimilarity, sharesFirstSyllable } from '../normalize/similarity';
import type { AliasRecallHit, AliasRow, RecallConfig } from './types';

export function recallByAlias(
  entityName: string,
  rows: readonly AliasRow[],
  cfg: RecallConfig,
): AliasRecallHit[] {
  const queryNorm = normalizeName(entityName);
  const hits: AliasRecallHit[] = [];

  for (const row of rows) {
    // ALIAS_EXACT
    if (row.aliasNorm === queryNorm) {
      hits.push({
        companyId: row.companyId,
        companyName: row.companyName,
        companyTicker: row.companyTicker,
        matchedAlias: row.alias,
        aliasType: row.aliasType,
        isAmbiguous: row.isAmbiguous,
        recallRule: 'ALIAS_EXACT',
        recallScore: cfg.baseScoreByRule.ALIAS_EXACT,
        isExactMatch: true,
      });
      continue;
    }

    // ALIAS_PREFIX — 별칭이 질의로 시작하거나 질의가 별칭으로 시작 (2자 이상)
    const minLen = Math.min(row.aliasNorm.length, queryNorm.length);
    const isPrefixMatch =
      minLen >= 2 && (row.aliasNorm.startsWith(queryNorm) || queryNorm.startsWith(row.aliasNorm));
    if (isPrefixMatch) {
      hits.push({
        companyId: row.companyId,
        companyName: row.companyName,
        companyTicker: row.companyTicker,
        matchedAlias: row.alias,
        aliasType: row.aliasType,
        isAmbiguous: row.isAmbiguous,
        recallRule: 'ALIAS_PREFIX',
        recallScore: cfg.baseScoreByRule.ALIAS_PREFIX,
        isExactMatch: false,
      });
      continue;
    }

    // ALIAS_JAMO_SIMILAR — sim ≥ floor, 또는 미달이어도 첫 음절이 같으면 ALIAS_PREFIX로 병합
    // (docs/09 §2 "자모 유사도" 절 — 한국 밈 연결은 대부분 첫 글자 공유형).
    const sim = jamoSimilarity(queryNorm, row.aliasNorm);
    if (sim >= cfg.jamoSimilarityFloor) {
      hits.push({
        companyId: row.companyId,
        companyName: row.companyName,
        companyTicker: row.companyTicker,
        matchedAlias: row.alias,
        aliasType: row.aliasType,
        isAmbiguous: row.isAmbiguous,
        recallRule: 'ALIAS_JAMO_SIMILAR',
        recallScore:
          cfg.baseScoreByRule.ALIAS_JAMO_SIMILAR_MIN +
          sim * cfg.baseScoreByRule.ALIAS_JAMO_SIMILAR_SPAN,
        isExactMatch: false,
      });
    } else if (sharesFirstSyllable(entityName, row.alias)) {
      hits.push({
        companyId: row.companyId,
        companyName: row.companyName,
        companyTicker: row.companyTicker,
        matchedAlias: row.alias,
        aliasType: row.aliasType,
        isAmbiguous: row.isAmbiguous,
        recallRule: 'ALIAS_PREFIX',
        recallScore: cfg.baseScoreByRule.ALIAS_PREFIX,
        isExactMatch: false,
      });
    }
  }

  // 회사당 최고 점수 후보 하나만 남기고, 점수 내림차순 정렬.
  const bestByCompany = new Map<number, AliasRecallHit>();
  for (const hit of hits) {
    const existing = bestByCompany.get(hit.companyId);
    if (!existing || hit.recallScore > existing.recallScore) bestByCompany.set(hit.companyId, hit);
  }
  return [...bestByCompany.values()].sort((a, b) => b.recallScore - a.recallScore);
}
