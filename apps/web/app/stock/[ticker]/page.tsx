import type { Metadata } from 'next';
import { getDb } from '@gukjang/db';
import { notFound } from 'next/navigation';
import { StockConnectionsPanel } from '../../../components/stock/stock-connections-panel';
import { StockHeader } from '../../../components/stock/stock-header';
import { getConnectionsForStock, getStockDetail } from '../../../lib/api/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const stock = await getStockDetail(getDb(), ticker);
  return { title: stock ? `${stock.company.name} — 국장레이더` : '국장레이더' };
}

/** S4 종목 상세 — docs/05-screen-specs.md, 역방향(이 종목에 걸린 뉴스). */
export default async function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const db = getDb();
  const stock = await getStockDetail(db, ticker);
  if (!stock) notFound();

  const connections = await getConnectionsForStock(db, ticker, { days: 7 });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <StockHeader company={stock.company} market={stock.market} spark={stock.spark} />

      <section className="mb-6">
        <h2 className="mb-2 border-b border-rule-strong pb-1 font-serif text-lg font-bold text-ink">
          오늘의 연결
        </h2>
        <StockConnectionsPanel connections={connections} />
      </section>

      <div className="border-2 border-rule-strong p-3 text-center font-sans text-xs text-ink">
        이 화면의 점수는 &ldquo;연결 강도&rdquo;이며 투자 추천·자문이 아닙니다. 매매 판단의 근거로
        쓰지 마세요.
      </div>
    </main>
  );
}
