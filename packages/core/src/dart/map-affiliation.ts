/**
 * T1.2.3 — DART 최대주주 현황에서 AFFILIATION 엣지 후보를 뽑는다.
 * 순수 함수 (R7): 주주명이 이미 알려진 상장기업(company) 이름과 일치할 때만
 * 후보를 만든다 — 개인 주주는 대상이 아니며, 회사 매칭 여부를 지어내지 않는다.
 *
 * docs/06-erd.md §3 예시를 그대로 재현한다:
 *   graph_edge 노루페인트 → 노루홀딩스  type=AFFILIATION  weight=0.9
 *     evidence={"source":"DART","corp_code":"...","doc":"최대주주현황"}
 */
import { normalizeName } from '../normalize/hangul';
import type { DartMajorShareholderRow } from './types';

export interface KnownCompany {
  companyId: number;
  nameNorm: string;
}

export interface AffiliationCandidate {
  relatedCompanyId: number;
  relate?: string;
  stakePercent: number | null;
  /** 0~1. 지분율이 높을수록 가중치를 높게, 상한 0.95 (docs 예시의 0.9와 같은 대역). */
  weight: number;
  /** DART 공시 근거이므로 고정 0.9 (R3: evidence 있는 엣지). */
  confidence: number;
}

const MIN_WEIGHT = 0.3;
const MAX_WEIGHT = 0.95;

function parseStakePercent(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function weightFromStake(stakePercent: number | null): number {
  if (stakePercent === null) return MIN_WEIGHT;
  // 0~100% → MIN_WEIGHT~MAX_WEIGHT 선형 매핑.
  const scaled = MIN_WEIGHT + (stakePercent / 100) * (MAX_WEIGHT - MIN_WEIGHT);
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Number(scaled.toFixed(3))));
}

/**
 * 최대주주 현황 행들 중 이름이 known company 목록과 일치하는 것만 골라
 * AFFILIATION 엣지 후보로 변환한다. 개인 주주(회사 목록에 없는 이름)는 제외한다.
 */
export function resolveAffiliationCandidates(
  shareholders: readonly DartMajorShareholderRow[],
  knownCompanies: readonly KnownCompany[],
  selfCompanyId: number,
): AffiliationCandidate[] {
  const byNorm = new Map<string, number>();
  for (const c of knownCompanies) {
    if (c.companyId !== selfCompanyId) byNorm.set(c.nameNorm, c.companyId);
  }

  const out: AffiliationCandidate[] = [];
  const seen = new Set<number>();

  for (const row of shareholders) {
    const norm = normalizeName(row.nm);
    const relatedCompanyId = byNorm.get(norm);
    if (relatedCompanyId === undefined || seen.has(relatedCompanyId)) continue;
    seen.add(relatedCompanyId);

    const stakePercent =
      parseStakePercent(row.trmend_posesn_stock_qota_rt) ??
      parseStakePercent(row.bsis_posesn_stock_qota_rt);

    out.push({
      relatedCompanyId,
      relate: row.relate,
      stakePercent,
      weight: weightFromStake(stakePercent),
      confidence: 0.9,
    });
  }

  return out;
}
