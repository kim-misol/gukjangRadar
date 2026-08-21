/**
 * graph_node upsert-or-fetch. extract-entities.ts(T2.2.4)와 sync-affiliation-edges.ts(T1.2.3)에
 * 각자 있던 동일 로직을 공용화한 것 — connections/(T2.3) 모듈도 이제 이걸 쓴다.
 */
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { and, eq } from 'drizzle-orm';

export async function ensureGraphNode(
  db: ReturnType<typeof getDb>,
  kind: (typeof schema.nodeKind.enumValues)[number],
  refId: number,
  label: string,
): Promise<number> {
  const isThisNode = and(eq(schema.graphNode.kind, kind), eq(schema.graphNode.refId, refId));
  const [existing] = await db
    .select({ id: schema.graphNode.id })
    .from(schema.graphNode)
    .where(isThisNode);
  if (existing) return existing.id;

  const [inserted] = await db
    .insert(schema.graphNode)
    .values({ kind, refId, label })
    .onConflictDoNothing({ target: [schema.graphNode.kind, schema.graphNode.refId] })
    .returning({ id: schema.graphNode.id });
  if (inserted) return inserted.id;

  const [row] = await db
    .select({ id: schema.graphNode.id })
    .from(schema.graphNode)
    .where(isThisNode);
  if (!row) throw new Error(`graph_node 생성/조회 실패: ${kind}#${refId}`);
  return row.id;
}
