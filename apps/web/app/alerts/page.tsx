import type { Metadata } from 'next';
import { getDb } from '@gukjang/db';
import { loadEnv } from '@gukjang/core';
import { getSessionUser } from '../../lib/auth/session';
import { listAlertKeywords } from '../../lib/api/alerts';
import { AlertsClient } from '../../components/alerts/alerts-client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '알림 — 국장레이더' };

/** S7 알림 — docs/05-screen-specs.md. 로그인 필요(docs/03-ia.md). */
export default async function AlertsPage() {
  const session = await getSessionUser();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 border-b border-rule-strong pb-2 font-serif text-2xl font-bold text-ink">
        알림
      </h1>

      {!session ? (
        <section className="border border-rule p-4">
          <p className="mb-3 font-sans text-sm text-ink-soft">
            키워드 알림은 로그인 후 이용할 수 있습니다.
          </p>
          <div className="flex gap-2">
            <a
              href="/api/v1/auth/kakao"
              className="border border-rule-strong px-3 py-1.5 font-mono text-xs text-ink"
            >
              카카오로 로그인
            </a>
            <a
              href="/api/v1/auth/google"
              className="border border-rule-strong px-3 py-1.5 font-mono text-xs text-ink"
            >
              구글로 로그인
            </a>
          </div>
        </section>
      ) : (
        <AlertsClient
          initialAlerts={await listAlertKeywords(getDb(), session.userId)}
          vapidPublicKey={loadEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        />
      )}
    </main>
  );
}
