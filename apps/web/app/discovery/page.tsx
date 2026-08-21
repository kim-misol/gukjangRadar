import { getDb } from '@gukjang/db';
import type { Metadata } from 'next';
import { DiscoveryRequestForm } from '../../components/discovery/request-form';
import { MemeRankBlock } from '../../components/home/meme-rank-block';
import { getMemeRank, getWeeklyMemeHallOfFame, latestTradeDate } from '../../lib/api/queries';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '발견 — 국장레이더' };

/** S5 발견 — docs/05-screen-specs.md. */
export default async function DiscoveryPage() {
  const db = getDb();
  const date = await latestTradeDate(db);

  const [today, weekly] = date
    ? await Promise.all([getMemeRank(db, date, 10), getWeeklyMemeHallOfFame(db, date, 10)])
    : [[], []];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 border-b border-rule-strong pb-2 font-serif text-2xl font-bold text-ink">
        발견
      </h1>
      <div className="space-y-6">
        {today.length === 0 ? (
          <p className="font-sans text-sm text-ink-soft">오늘은 조용합니다.</p>
        ) : (
          <MemeRankBlock items={today} title="😂 오늘의 억지 관련주" showShare />
        )}
        {weekly.length > 0 && (
          <MemeRankBlock items={weekly} title="🏆 이번 주 명예의 전당" showShare />
        )}
        <DiscoveryRequestForm />
      </div>
    </main>
  );
}
