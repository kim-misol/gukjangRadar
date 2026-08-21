/**
 * docs/08-prompt-entity-extraction.md §6-④ — canonical_id 동의어 병합 판정.
 * 순수 함수, IO 없음 (R7). 두 개체가 동의어로 판별된 경우(예: "엔비디아"↔"NVIDIA")
 * 어느 쪽을 canonical로 삼고 어느 루트를 강등할지만 결정한다. 실제 DB UPDATE는 apps/worker가
 * 담당한다.
 */
export interface EntityCanonicalRef {
  id: number;
  canonicalId: number | null;
}

export interface CanonicalMergePlan {
  /** 이 값으로 남게 될 루트(항상 더 먼저 생성된, id가 작은 쪽). */
  canonicalId: number;
  /** canonical_id가 이 값으로 갱신돼야 하는 "강등되는 루트". */
  demotedRootId: number;
}

/**
 * `canonical_id`는 항상 "진짜 루트"(자기 자신의 canonical_id가 NULL인 행)만 가리킨다는
 * 불변식을 유지한다 — 호출부가 `UPDATE entity SET canonical_id = plan.canonicalId
 * WHERE id = plan.demotedRootId OR canonical_id = plan.demotedRootId`로 갱신하면, 이전에
 * demotedRootId를 가리키고 있던 다른 개체들도 함께 새 루트로 평탄화된다(체인 2홉 이상 방지).
 * 이미 같은 루트를 가리키고 있으면(이미 병합됨) null을 돌려준다.
 */
export function decideCanonicalMerge(
  a: EntityCanonicalRef,
  b: EntityCanonicalRef,
): CanonicalMergePlan | null {
  const rootA = a.canonicalId ?? a.id;
  const rootB = b.canonicalId ?? b.id;
  if (rootA === rootB) return null;

  return {
    canonicalId: Math.min(rootA, rootB),
    demotedRootId: Math.max(rootA, rootB),
  };
}
