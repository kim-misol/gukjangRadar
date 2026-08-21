/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-*.ts와 동일한 위치).
 * docs/19-remaining-work.md §4 "canonical_id 동의어 병합 없음" 실 검증
 * (docs/08-prompt-entity-extraction.md §6-④, apps/worker/src/entity/merge-synonyms.ts).
 *
 * 확인 항목:
 *  1) "엔비디아"(먼저 생성) ↔ "NVIDIA"(나중, alias로 "엔비디아" 포함) → NVIDIA가 강등되고
 *     엔비디아가 canonical로 남는다(id가 작은 쪽 우선).
 *  2) 재실행(멱등) — 이미 병합됐으면 다시 갱신하지 않는다.
 *  3) 체인 평탄화 — 새 개체가 "이미 강등된 개체"(NVIDIA)의 이름을 alias로 가리키면, 2홉을
 *     거치지 않고 진짜 루트(엔비디아)를 바로 가리킨다.
 *  4) 그룹 병합 평탄화 — 이미 각자 하위 멤버를 가진 두 그룹이 합쳐지면, 진 쪽 그룹의 모든
 *     멤버(자기 자신 + 하위 멤버)가 한 번에 이긴 쪽 루트로 갱신된다.
 *  5) kind가 다르면(같은 표기라도) 병합하지 않는다.
 *
 * 실행: pnpm manual-verify-canonical-merge
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import { eq, inArray } from 'drizzle-orm';
import { normalizeEntityName, toJamo } from '@gukjang/core';
import { mergeSynonymAliases } from '../apps/worker/src/entity/merge-synonyms';

async function insertEntity(
  db: ReturnType<typeof getDb>,
  name: string,
  kind: 'ORG' | 'PERSON',
): Promise<number> {
  const nameNorm = normalizeEntityName(name);
  const [row] = await db
    .insert(schema.entity)
    .values({ name, nameNorm, nameJamo: toJamo(nameNorm), kind, mentionTotal: 1 })
    .returning({ id: schema.entity.id });
  if (!row) throw new Error(`entity 생성 실패: ${name}`);
  return row.id;
}

async function canonicalOf(db: ReturnType<typeof getDb>, id: number): Promise<number | null> {
  const [row] = await db
    .select({ canonicalId: schema.entity.canonicalId })
    .from(schema.entity)
    .where(eq(schema.entity.id, id));
  return row?.canonicalId ?? null;
}

async function main(): Promise<void> {
  const db = getDb();
  const createdIds: number[] = [];

  // ── 1) 기본 쌍 병합: 엔비디아(먼저) ↔ NVIDIA(나중, alias=["엔비디아"]) ──────
  const nvidiaKr = await insertEntity(db, '엔비디아', 'ORG');
  const nvidiaEn = await insertEntity(db, 'NVIDIA', 'ORG');
  createdIds.push(nvidiaKr, nvidiaEn);

  await mergeSynonymAliases(db, nvidiaEn, normalizeEntityName('NVIDIA'), 'ORG', ['엔비디아']);
  const afterFirstMerge = await canonicalOf(db, nvidiaEn);
  console.log(
    '[1/5] NVIDIA canonicalId(엔비디아 id이어야 함):',
    afterFirstMerge,
    '| 기대값:',
    nvidiaKr,
  );

  // ── 2) 멱등성: 다시 돌려도 그대로 ─────────────────────────────────────────
  await mergeSynonymAliases(db, nvidiaEn, normalizeEntityName('NVIDIA'), 'ORG', ['엔비디아']);
  const afterRerun = await canonicalOf(db, nvidiaEn);
  console.log('[2/5] 재실행 후에도 그대로인가:', afterRerun === afterFirstMerge);

  // ── 3) 체인 평탄화: 새 개체가 이미 강등된 NVIDIA를 alias로 가리키면 엔비디아로 직결 ──
  const nvidiaTypo = await insertEntity(db, '엔비디아사', 'ORG');
  createdIds.push(nvidiaTypo);
  await mergeSynonymAliases(db, nvidiaTypo, normalizeEntityName('엔비디아사'), 'ORG', ['NVIDIA']);
  const chainResult = await canonicalOf(db, nvidiaTypo);
  console.log(
    '[3/5] 체인 평탄화 — 엔비디아사 canonicalId(엔비디아 id로 직결이어야 함, NVIDIA 경유 X):',
    chainResult,
    '| 기대값:',
    nvidiaKr,
  );

  // ── 4) 그룹 병합 평탄화: 두 그룹(각자 하위 멤버 보유)이 합쳐지면 전원 갱신 ──────
  const groupARoot = await insertEntity(db, '테스트그룹A', 'ORG');
  const groupAChild = await insertEntity(db, '테스트그룹A자회사', 'ORG');
  const groupBRoot = await insertEntity(db, '테스트그룹B', 'ORG');
  const groupBChild = await insertEntity(db, '테스트그룹B자회사', 'ORG');
  createdIds.push(groupARoot, groupAChild, groupBRoot, groupBChild);

  await mergeSynonymAliases(db, groupAChild, normalizeEntityName('테스트그룹A자회사'), 'ORG', [
    '테스트그룹A',
  ]);
  await mergeSynonymAliases(db, groupBChild, normalizeEntityName('테스트그룹B자회사'), 'ORG', [
    '테스트그룹B',
  ]);
  // 이제 groupBRoot 자신이 groupARoot와 동의어라고 판정되는 상황을 시뮬레이션 —
  // 이긴 쪽(더 작은 id)이 groupARoot라고 가정하고 groupBRoot 쪽에서 병합을 트리거한다.
  await mergeSynonymAliases(db, groupBRoot, normalizeEntityName('테스트그룹B'), 'ORG', [
    '테스트그룹A',
  ]);

  const [bRootCanon, bChildCanon] = await Promise.all([
    canonicalOf(db, groupBRoot),
    canonicalOf(db, groupBChild),
  ]);
  console.log(
    '[4/5] 그룹 평탄화 — groupBRoot canonicalId:',
    bRootCanon,
    '| groupBChild canonicalId:',
    bChildCanon,
    '| 기대값(둘 다 groupARoot id):',
    groupARoot,
  );

  // ── 5) alias 표기가 다른 kind의 개체 이름과 완전히 같아도 병합하지 않는다 ──
  const orgEntity = await insertEntity(db, '테스트동명이인', 'ORG');
  const personEntity = await insertEntity(db, '테스트동명이인B', 'PERSON');
  createdIds.push(orgEntity, personEntity);
  await mergeSynonymAliases(db, personEntity, normalizeEntityName('테스트동명이인B'), 'PERSON', [
    '테스트동명이인',
  ]);
  const personCanon = await canonicalOf(db, personEntity);
  console.log(
    '[5/5] kind가 다르면 병합 안 됨 — personEntity canonicalId(null이어야 함):',
    personCanon,
  );

  // cleanup
  await db.delete(schema.entity).where(inArray(schema.entity.id, createdIds));
  console.log('cleanup 완료');

  const ok =
    afterFirstMerge === nvidiaKr &&
    afterRerun === nvidiaKr &&
    chainResult === nvidiaKr &&
    bRootCanon === groupARoot &&
    bChildCanon === groupARoot &&
    personCanon === null;

  if (!ok) {
    console.error('✗ 일부 검증 실패');
    process.exit(1);
  }
  console.log('✓ 전체 검증 통과');
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
