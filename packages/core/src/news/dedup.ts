/**
 * T2.1.2 — simhash 해밍거리 기반 근접 중복 판별 (docs/11-pipeline.md §2-③).
 * 순수 함수. 어떤 기사를 "중복이라 지운다"고 판정만 할 뿐, DB 반영은 worker가 한다.
 */
import { hammingDistance32 } from './simhash';

export interface DedupCandidate {
  id: number;
  simhash: number | null;
  publishedAt: Date;
}

/**
 * 근접 중복(해밍거리 ≤ maxDistance) 그룹마다 가장 먼저 발행된 기사만 남기고,
 * 나머지의 id를 반환한다 (worker가 이 id들에 is_deleted=true를 세팅한다).
 * simhash가 없는 기사는 비교 대상에서 제외한다(중복 판정 불가).
 */
export function pickDuplicateArticleIds(
  articles: readonly DedupCandidate[],
  maxDistance = 3,
): number[] {
  const withHash = articles.filter(
    (a): a is DedupCandidate & { simhash: number } => a.simhash !== null,
  );
  const sorted = [...withHash].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

  const kept: (DedupCandidate & { simhash: number })[] = [];
  const duplicateIds: number[] = [];

  for (const article of sorted) {
    const dupOfKept = kept.find(
      (k) => hammingDistance32(k.simhash, article.simhash) <= maxDistance,
    );
    if (dupOfKept) {
      duplicateIds.push(article.id);
    } else {
      kept.push(article);
    }
  }

  return duplicateIds;
}
