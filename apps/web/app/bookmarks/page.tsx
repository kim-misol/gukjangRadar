import type { Metadata } from 'next';
import { getDb } from '@gukjang/db';
import { StockConnectionsPanel } from '../../components/stock/stock-connections-panel';
import { listBookmarkedConnections } from '../../lib/api/bookmarks';
import { getSessionUser } from '../../lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '북마크 — 국장레이더' };

/** C12 저장/북마크(V1.1) — docs/19-remaining-work.md §3. 로그인 필요(alerts/도 같은 패턴). */
export default async function BookmarksPage() {
  const session = await getSessionUser();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 border-b border-rule-strong pb-2 font-serif text-2xl font-bold text-ink">
        북마크
      </h1>

      {!session ? (
        <section className="border border-rule p-4">
          <p className="mb-3 font-sans text-sm text-ink-soft">
            연결을 저장하려면 로그인이 필요합니다.
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
        <BookmarksList userId={session.userId} />
      )}
    </main>
  );
}

async function BookmarksList({ userId }: { userId: number }) {
  const connections = await listBookmarkedConnections(getDb(), userId);

  if (connections.length === 0) {
    return <p className="font-sans text-sm text-ink-soft">저장한 연결이 없습니다.</p>;
  }

  // 이 목록 자체가 "북마크된 것들"이라 전부 bookmarkedIds에 들어간다 — 별도 조회 불필요.
  const bookmarkedIds = new Set(connections.map((c) => c.id));
  return <StockConnectionsPanel connections={connections} bookmarkedIds={bookmarkedIds} loggedIn />;
}
