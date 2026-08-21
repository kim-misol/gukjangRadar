/**
 * docs/08-prompt-entity-extraction.md §6-④ — canonical_id 동의어 병합.
 * W4에서 "개체별 별칭 이력 저장소가 없어 보류"했던 항목(docs/15 W4 진행 기록) — 별도 저장소를
 * 새로 만드는 대신, 매 추출 배치마다 LLM이 이미 주는 `aliases` 필드(같은 대상의 다른 표기,
 * entity_extraction.md 규칙 #6)를 그 자리에서 기존 entity.name_norm과 대조하는 방식으로
 * 구현했다 — 프롬프트가 매번 문맥에서 별칭을 다시 뽑아주므로 별도 이력 없이도 대부분의
 * 동의어 쌍(예: "엔비디아"↔"NVIDIA")을 그때그때 잡을 수 있다.
 *
 * 판정(누가 canonical이 되는지)은 packages/core의 순수 함수 decideCanonicalMerge가 맡고,
 * 여기서는 조회+UPDATE만 한다. kind가 같은 entity끼리만 대조한다 — PERSON과 ORG처럼 다른
 * kind가 우연히 같은 표기를 쓰는 경우까지 병합하면 오탐이 된다.
 *
 * **의도적으로 하지 않은 것**: graph_node(ENTITY)는 여전히 개체 자신의 id로 생성된다
 * (build-connections.ts의 entityRows 조회가 `graph_node.ref_id = entity.id`로 조인하기
 * 때문 — canonical_id를 graph_node refId에 반영하려면 그 조인도 같이 고쳐야 하는데, 이
 * 파이프라인의 심장(연결 생성)에 회귀 위험을 남기고 싶지 않아 이번 스코프에서는 뺐다).
 * 즉 지금은 canonical_id가 정확히 채워지기 시작하지만, recall/그래프 탐색이 그 값을 아직
 * 소비하지 않는다 — 다음 스텝 후보.
 */
import { decideCanonicalMerge, normalizeEntityName } from '@gukjang/core';
import type { EntityKind } from '@gukjang/spec';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { and, eq, ne, or } from 'drizzle-orm';

export interface MergeSynonymAliasesResult {
  mergedPairs: number;
}

export async function mergeSynonymAliases(
  db: ReturnType<typeof getDb>,
  entityId: number,
  nameNorm: string,
  kind: EntityKind,
  aliases: readonly string[],
): Promise<MergeSynonymAliasesResult> {
  let mergedPairs = 0;

  for (const alias of aliases) {
    const aliasNorm = normalizeEntityName(alias);
    if (!aliasNorm || aliasNorm === nameNorm) continue;

    const [synonym] = await db
      .select({ id: schema.entity.id, canonicalId: schema.entity.canonicalId })
      .from(schema.entity)
      .where(
        and(
          eq(schema.entity.nameNorm, aliasNorm),
          eq(schema.entity.kind, kind),
          ne(schema.entity.id, entityId),
        ),
      );
    if (!synonym) continue;

    // 같은 요청 안에서 앞선 별칭이 이미 이 entity를 병합시켰을 수 있어 매번 다시 조회한다.
    const [current] = await db
      .select({ id: schema.entity.id, canonicalId: schema.entity.canonicalId })
      .from(schema.entity)
      .where(eq(schema.entity.id, entityId));
    if (!current) continue;

    const plan = decideCanonicalMerge(current, synonym);
    if (!plan) continue;

    await db
      .update(schema.entity)
      .set({ canonicalId: plan.canonicalId })
      .where(
        or(
          eq(schema.entity.id, plan.demotedRootId),
          eq(schema.entity.canonicalId, plan.demotedRootId),
        ),
      );
    mergedPairs++;
  }

  return { mergedPairs };
}
