/**
 * 수동 검증 전용 스크립트 (커밋에 남기되 CI/DoD 스크립트는 아님 — manual-verify-*.ts와 동일한 위치).
 * docs/19-remaining-work.md §4 "entity upsert가 subtype을 갱신하지 않음"(2026-08-21 발견 버그)
 * 수정 검증. extract-entities.ts와 정확히 같은 insert+onConflictDoUpdate 패턴을 그대로
 * 재현해 확인한다(전체 LLM/클러스터 파이프라인 없이 upsert 동작만 격리).
 *
 * 확인 항목:
 *  1) 최초 insert — subtype 없이 생성되면 NULL로 저장된다(과거의 "노루" 행과 같은 상황 재현).
 *  2) 같은 (name_norm,kind)로 subtype 있는 값이 다시 들어오면 실제로 갱신된다(버그 수정 확인).
 *  3) 그 다음 subtype 없는 값이 다시 들어와도(undefined) 기존 값을 null로 되돌리지 않는다.
 *
 * 실행: pnpm manual-verify-entity-subtype-upsert
 */
import { closeDb, getDb, schema } from '@gukjang/db';
import { eq, sql } from 'drizzle-orm';
import { normalizeEntityName, toJamo } from '@gukjang/core';

async function upsert(
  db: ReturnType<typeof getDb>,
  nameNorm: string,
  subtype: string | undefined,
): Promise<number> {
  const [row] = await db
    .insert(schema.entity)
    .values({
      name: nameNorm,
      nameNorm,
      nameJamo: toJamo(nameNorm),
      kind: 'WORD',
      subtype,
      mentionTotal: 1,
    })
    .onConflictDoUpdate({
      target: [schema.entity.nameNorm, schema.entity.kind],
      set: {
        mentionTotal: sql`${schema.entity.mentionTotal} + 1`,
        ...(subtype ? { subtype } : {}),
      },
    })
    .returning({ id: schema.entity.id });
  if (!row) throw new Error('entity upsert 실패');
  return row.id;
}

async function subtypeOf(db: ReturnType<typeof getDb>, id: number): Promise<string | null> {
  const [row] = await db
    .select({ subtype: schema.entity.subtype })
    .from(schema.entity)
    .where(eq(schema.entity.id, id));
  return row?.subtype ?? null;
}

async function main(): Promise<void> {
  const db = getDb();
  const nameNorm = normalizeEntityName('버그검증태풍이름');

  const id1 = await upsert(db, nameNorm, undefined);
  const afterFirstInsert = await subtypeOf(db, id1);
  console.log('[1/3] 최초 insert(subtype 없음) — subtype(NULL이어야 함):', afterFirstInsert);

  const id2 = await upsert(db, nameNorm, 'TYPHOON_NAME');
  const afterSubtypeSet = await subtypeOf(db, id2);
  console.log(
    '[2/3] 같은 개체 재추출(subtype=TYPHOON_NAME) — subtype 갱신되는가(TYPHOON_NAME이어야 함):',
    afterSubtypeSet,
    '| 같은 행인가:',
    id1 === id2,
  );

  const id3 = await upsert(db, nameNorm, undefined);
  const afterUndefinedAgain = await subtypeOf(db, id3);
  console.log(
    '[3/3] 다시 subtype 없이 재추출 — 기존 값을 null로 되돌리지 않는가(TYPHOON_NAME 유지):',
    afterUndefinedAgain,
  );

  await db.delete(schema.entity).where(eq(schema.entity.id, id1));
  console.log('cleanup 완료');

  const ok =
    afterFirstInsert === null &&
    id1 === id2 &&
    afterSubtypeSet === 'TYPHOON_NAME' &&
    afterUndefinedAgain === 'TYPHOON_NAME';
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
