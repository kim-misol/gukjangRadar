/**
 * T2.3.3 — 후보 병합·상한·경로 조립의 마지막 단계.
 * 여러 Recall 룰이 같은 회사를 서로 다른 경로로 찾아낼 수 있다 — 회사당 recallScore가
 * 가장 높은 경로 하나만 남기고, 전체를 recallScore 내림차순 정렬해 상한(기본 40)으로 자른다.
 * docs/09 §2: "후보 상한 40개. 초과 시 recallScore 기준 절단." 순수 함수, IO 없음 (R7).
 */
import type { Candidate } from '@gukjang/spec';

export function mergeCandidates(candidateLists: readonly Candidate[][], cap: number): Candidate[] {
  const bestByCompany = new Map<number, Candidate>();
  for (const list of candidateLists) {
    for (const candidate of list) {
      const existing = bestByCompany.get(candidate.companyId);
      if (!existing || candidate.recallScore > existing.recallScore) {
        bestByCompany.set(candidate.companyId, candidate);
      }
    }
  }
  return [...bestByCompany.values()].sort((a, b) => b.recallScore - a.recallScore).slice(0, cap);
}
