import { getDb } from '@gukjang/db';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AnalysisPendingPoller } from '../../../components/news/analysis-pending-poller';
import { ConnectionListSection } from '../../../components/news/connection-list-section';
import { NewsDetailGraphSection } from '../../../components/news/news-detail-graph-section';
import { NewsDetailHeader } from '../../../components/news/news-detail-header';
import { getGraphForCluster, getNewsClusterDetail } from '../../../lib/api/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}): Promise<Metadata> {
  const clusterId = Number((await params).clusterId);
  if (!Number.isInteger(clusterId)) return {};
  const cluster = await getNewsClusterDetail(getDb(), clusterId);
  return { title: cluster ? `${cluster.headline} — 국장레이더` : '국장레이더' };
}

/** S2 뉴스 상세 — docs/05-screen-specs.md. */
export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ clusterId: string }>;
}) {
  const clusterId = Number((await params).clusterId);
  if (!Number.isInteger(clusterId)) notFound();

  const cluster = await getNewsClusterDetail(getDb(), clusterId);
  if (!cluster) notFound();

  const isPending = cluster.analysisStatus === 'PENDING' || cluster.analysisStatus === 'RUNNING';
  const graph = isPending ? null : await getGraphForCluster(getDb(), clusterId);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      {isPending && <AnalysisPendingPoller clusterId={clusterId} />}
      <NewsDetailHeader cluster={cluster} />

      <section className="mb-6">
        <h2 className="mb-1 font-mono text-xs text-ink-soft">AI 3줄 요약</h2>
        {cluster.aiSummary ? (
          <p className="font-serif text-base leading-relaxed text-ink">{cluster.aiSummary}</p>
        ) : isPending ? (
          <div className="space-y-2" aria-hidden>
            <div className="h-4 w-full animate-pulse bg-rule/40" />
            <div className="h-4 w-5/6 animate-pulse bg-rule/40" />
            <div className="h-4 w-2/3 animate-pulse bg-rule/40" />
          </div>
        ) : (
          <p className="font-sans text-sm text-ink-soft">요약을 만들지 못했습니다.</p>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-mono text-xs text-ink-soft">핵심 개체 · 연결 그래프</h2>
        {graph ? (
          <NewsDetailGraphSection entities={cluster.entities} graph={graph} />
        ) : (
          <div className="h-48 animate-pulse border border-rule bg-rule/10" aria-hidden />
        )}
      </section>

      <section>
        <h2 className="mb-2 font-mono text-xs text-ink-soft">연결 종목</h2>
        {isPending ? (
          <div className="h-24 animate-pulse border border-rule bg-rule/10" aria-hidden />
        ) : (
          <ConnectionListSection connections={cluster.topConnections} />
        )}
      </section>
    </main>
  );
}
