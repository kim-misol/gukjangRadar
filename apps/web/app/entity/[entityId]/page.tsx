import type { Metadata } from 'next';
import { getDb } from '@gukjang/db';
import { notFound } from 'next/navigation';
import { StockConnectionsPanel } from '../../../components/stock/stock-connections-panel';
import { getEntityDetail } from '../../../lib/api/queries';
import { getBookmarkedConnectionIds } from '../../../lib/api/bookmarks';
import { getSessionUser } from '../../../lib/auth/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ entityId: string }>;
}): Promise<Metadata> {
  const entityId = Number((await params).entityId);
  const detail = Number.isInteger(entityId) ? await getEntityDetail(getDb(), entityId) : null;
  return { title: detail ? `${detail.name} — 국장레이더` : '국장레이더' };
}

/** C9 개체 허브(V1.1, docs/19-remaining-work.md §3) — 이 개체가 등장한 연결 전부(역방향). */
export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const entityId = Number((await params).entityId);
  if (!Number.isInteger(entityId)) notFound();

  const db = getDb();
  const detail = await getEntityDetail(db, entityId);
  if (!detail) notFound();

  const session = await getSessionUser();
  const bookmarkedIds = session
    ? await getBookmarkedConnectionIds(
        db,
        session.userId,
        detail.connections.map((c) => c.id),
      )
    : new Set<number>();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-1 font-serif text-2xl font-bold text-ink">{detail.name}</h1>
      <p className="mb-6 font-mono text-xs text-ink-soft">
        {detail.kind}
        {detail.subtype ? ` · ${detail.subtype}` : ''} · 언급 {detail.mentionTotal}회
      </p>

      <section className="mb-6">
        <h2 className="mb-2 border-b border-rule-strong pb-1 font-serif text-lg font-bold text-ink">
          이 개체로 발견된 연결
        </h2>
        <StockConnectionsPanel
          connections={detail.connections}
          bookmarkedIds={bookmarkedIds}
          loggedIn={Boolean(session)}
        />
      </section>

      <div className="border-2 border-rule-strong p-3 text-center font-sans text-xs text-ink">
        이 화면의 점수는 &ldquo;연결 강도&rdquo;이며 투자 추천·자문이 아닙니다. 매매 판단의 근거로
        쓰지 마세요.
      </div>
    </main>
  );
}
