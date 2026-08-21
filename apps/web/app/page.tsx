import { getDb } from '@gukjang/db';
import { MemeRankBlock } from '../components/home/meme-rank-block';
import { MoverNewsBlock } from '../components/home/mover-news-block';
import { NewsClusterCard } from '../components/home/news-cluster-card';
import { RecentConnectionsBlock } from '../components/home/recent-connections-block';
import { getHomeData } from '../lib/api/queries';

export const dynamic = 'force-dynamic';

/** S1 홈 — docs/05-screen-specs.md, 레이아웃은 docs/17-screen-design-guide.md 3열 그리드. */
export default async function HomePage() {
  const home = await getHomeData(getDb());

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <MemeRankBlock items={home.memeRank} />
          <section>
            <h2 className="mb-1 border-b border-rule-strong pb-2 font-serif text-lg font-bold text-ink">
              🔥 지금 화제인 뉴스
            </h2>
            {home.clusters.length === 0 ? (
              <p className="py-6 font-sans text-sm text-ink-soft">오늘은 조용합니다.</p>
            ) : (
              <div>
                {home.clusters.map((cluster, i) => (
                  <NewsClusterCard key={cluster.id} cluster={cluster} rank={i + 1} />
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="space-y-6">
          <MoverNewsBlock movers={home.movers} isPreMarket={home.isPreMarket} />
          <RecentConnectionsBlock connections={home.recentConnections} />
        </aside>
      </div>
    </main>
  );
}
