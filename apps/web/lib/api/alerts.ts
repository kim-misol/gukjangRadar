/**
 * T3.3.2 — /v1/alerts CRUD (docs/05 S7: 무료 최대 5개, minScore/includeMeme 조건).
 */
import { and, eq, sql } from 'drizzle-orm';
import { normalizeName } from '@gukjang/core';
import { schema, type getDb } from '@gukjang/db';
import type { AlertKeywordDto, AlertKeywordInput } from '@gukjang/spec';

type Db = ReturnType<typeof getDb>;

const FREE_PLAN_KEYWORD_LIMIT = 5;

function toDto(row: typeof schema.alertKeyword.$inferSelect): AlertKeywordDto {
  return {
    id: row.id,
    keyword: row.keyword,
    minScore: row.minScore,
    includeMeme: row.includeMeme,
    isActive: row.isActive,
  };
}

export async function listAlertKeywords(db: Db, userId: number): Promise<AlertKeywordDto[]> {
  const rows = await db
    .select()
    .from(schema.alertKeyword)
    .where(eq(schema.alertKeyword.userId, userId))
    .orderBy(schema.alertKeyword.createdAt);
  return rows.map(toDto);
}

export type CreateAlertKeywordResult =
  { ok: true; alert: AlertKeywordDto } | { ok: false; error: 'DUPLICATE' | 'PLAN_LIMIT' };

export async function createAlertKeyword(
  db: Db,
  userId: number,
  input: AlertKeywordInput,
): Promise<CreateAlertKeywordResult> {
  const countRows = await db
    .select({ existingCount: sql<number>`count(*)::int` })
    .from(schema.alertKeyword)
    .where(eq(schema.alertKeyword.userId, userId));
  const existingCount = countRows[0]?.existingCount ?? 0;

  // V1은 과금 기능이 꺼져 있다(PRD D1) — plan과 무관하게 FREE 한도만 적용한다.
  if (existingCount >= FREE_PLAN_KEYWORD_LIMIT) {
    return { ok: false, error: 'PLAN_LIMIT' };
  }

  const keywordNorm = normalizeName(input.keyword);
  const [row] = await db
    .insert(schema.alertKeyword)
    .values({
      userId,
      keyword: input.keyword,
      keywordNorm,
      minScore: input.minScore ?? 60,
      includeMeme: input.includeMeme ?? true,
    })
    .onConflictDoNothing({
      target: [schema.alertKeyword.userId, schema.alertKeyword.keywordNorm],
    })
    .returning();

  if (!row) return { ok: false, error: 'DUPLICATE' };
  return { ok: true, alert: toDto(row) };
}

export async function deleteAlertKeyword(
  db: Db,
  userId: number,
  alertId: number,
): Promise<boolean> {
  const rows = await db
    .delete(schema.alertKeyword)
    .where(and(eq(schema.alertKeyword.id, alertId), eq(schema.alertKeyword.userId, userId)))
    .returning({ id: schema.alertKeyword.id });
  return rows.length > 0;
}
