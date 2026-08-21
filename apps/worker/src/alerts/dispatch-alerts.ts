/**
 * T3.3.4 — 알림 발송 잡 본체 (docs/11 §2 ⑭). `connection.build`가 클러스터의 연결을
 * 저장한 직후 `alert.dispatch` 큐에서 호출된다.
 * 판정(누구에게 보낼지)은 packages/core의 순수 함수(decideAlertDispatch/matchesAlertKeyword)에
 * 위임하고, 여기서는 DB 조회·실제 발송(IO)만 담당한다(R7).
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { schema, type getDb } from '@gukjang/db';
import { decideAlertDispatch, matchesAlertKeyword, normalizeName } from '@gukjang/core';
import type { ConnectionKind } from '@gukjang/spec';

type Db = ReturnType<typeof getDb>;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export interface WebPushSendResult {
  ok: boolean;
  /** 실패 시 HTTP 상태 — 404/410이면 구독이 죽은 것이므로 정리한다. */
  statusCode?: number;
}

export type SendPushFn = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload,
) => Promise<WebPushSendResult>;

export interface AlertDispatchDeps {
  db: Db;
  now: Date;
  sendPush: SendPushFn;
}

export interface AlertDispatchSummary {
  matched: number;
  sent: number;
  skipped: number;
}

/** `now`가 속한 KST 하루의 시작을 UTC 인스턴트로 돌려준다 — 일일 발송 상한 집계 경계. */
function startOfKstDayUtc(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60 * 1000);
}

export async function dispatchAlertsForCluster(
  deps: AlertDispatchDeps,
  clusterId: number,
): Promise<AlertDispatchSummary> {
  const { db, now, sendPush } = deps;
  const summary: AlertDispatchSummary = { matched: 0, sent: 0, skipped: 0 };

  const [cluster] = await db
    .select({ headline: schema.newsCluster.headline })
    .from(schema.newsCluster)
    .where(eq(schema.newsCluster.id, clusterId))
    .limit(1);
  if (!cluster) return summary;

  const clusterHeadlineNorm = normalizeName(cluster.headline);

  const entityRows = await db
    .select({ nameNorm: schema.entity.nameNorm })
    .from(schema.newsEntity)
    .innerJoin(schema.entity, eq(schema.entity.id, schema.newsEntity.entityId))
    .where(eq(schema.newsEntity.clusterId, clusterId));
  const entityNameNorms = entityRows.map((r) => r.nameNorm);

  const connections = await db
    .select({
      id: schema.connection.id,
      connectionType: schema.connection.connectionType,
      connectionScore: schema.connection.connectionScore,
      memeScore: schema.connection.memeScore,
      companyName: schema.company.name,
    })
    .from(schema.connection)
    .innerJoin(schema.company, eq(schema.company.id, schema.connection.companyId))
    .where(and(eq(schema.connection.clusterId, clusterId), eq(schema.connection.status, 'ACTIVE')))
    .orderBy(sql`${schema.connection.connectionScore} desc`);
  if (connections.length === 0) return summary;

  const activeKeywords = await db
    .select()
    .from(schema.alertKeyword)
    .where(eq(schema.alertKeyword.isActive, true));

  const dayStart = startOfKstDayUtc(now);

  for (const alert of activeKeywords) {
    const matched = matchesAlertKeyword({
      keywordNorm: alert.keywordNorm,
      clusterHeadlineNorm,
      entityNameNorms,
    });
    if (!matched) continue;
    summary.matched++;

    const countRows = await db
      .select({ dailyCount: sql<number>`count(*)::int` })
      .from(schema.alertDelivery)
      .where(
        and(eq(schema.alertDelivery.alertId, alert.id), gte(schema.alertDelivery.sentAt, dayStart)),
      );
    const dailyDeliveryCount = countRows[0]?.dailyCount ?? 0;

    const candidate = connections.find(
      (c) =>
        decideAlertDispatch({
          minScore: alert.minScore,
          includeMeme: alert.includeMeme,
          connectionType: c.connectionType as ConnectionKind,
          connectionScore: c.connectionScore,
          memeScore: c.memeScore,
          dailyDeliveryCount,
          now,
        }).dispatch,
    );
    if (!candidate) {
      summary.skipped++;
      continue;
    }

    const [deliveryRow] = await db
      .insert(schema.alertDelivery)
      .values({ alertId: alert.id, clusterId, connectionId: candidate.id, sentAt: now })
      .onConflictDoNothing({
        target: [schema.alertDelivery.alertId, schema.alertDelivery.clusterId],
      })
      .returning({ id: schema.alertDelivery.id });
    if (!deliveryRow) {
      // 이미 발송됨 — 재실행(멱등성, docs/11 §3)이나 동시 실행 대비.
      summary.skipped++;
      continue;
    }

    const subs = await db
      .select()
      .from(schema.pushSubscription)
      .where(eq(schema.pushSubscription.userId, alert.userId));

    const payload: PushPayload = {
      title: '국장레이더',
      body: `"${alert.keyword}" 뉴스 발생 · 연결 발견: ${candidate.companyName} (${candidate.connectionType} ${candidate.connectionScore})`,
      url: `/news/${clusterId}`,
    };

    for (const sub of subs) {
      const result = await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      if (!result.ok && (result.statusCode === 404 || result.statusCode === 410)) {
        await db.delete(schema.pushSubscription).where(eq(schema.pushSubscription.id, sub.id));
      }
    }
    summary.sent++;
  }

  return summary;
}
