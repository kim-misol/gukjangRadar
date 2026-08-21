/** T3.3.3 — 웹푸시 구독 등록 (docs/05 S7). endpoint UNIQUE로 재구독을 멱등 처리한다. */
import { schema, type getDb } from '@gukjang/db';

type Db = ReturnType<typeof getDb>;

export async function subscribePush(
  db: Db,
  userId: number,
  subscription: { endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  await db
    .insert(schema.pushSubscription)
    .values({ userId, ...subscription })
    .onConflictDoUpdate({
      target: schema.pushSubscription.endpoint,
      set: { userId, p256dh: subscription.p256dh, auth: subscription.auth },
    });
}
