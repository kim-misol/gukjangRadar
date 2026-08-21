import type { NewsClusterDto } from '@gukjang/spec';
import Link from 'next/link';
import { formatRelativeTime } from '../../lib/format/relative-time';
import { cn } from '../../lib/utils';
import { CompanyChip } from './company-chip';

/** docs/05-screen-specs.md S1 NewsClusterListBlock 카드 + docs/17 컴포넌트 패턴(랭크/HEAT/헤드라인/칩/메타). */
export function NewsClusterCard({ cluster, rank }: { cluster: NewsClusterDto; rank: number }) {
  const isTop = rank === 1;
  const mediaCount = new Set(cluster.sources.map((s) => s.name)).size || cluster.articleCount;

  return (
    <Link
      href={`/news/${cluster.id}`}
      className="flex gap-3 border-b border-rule py-4 first:pt-0 last:border-b-0"
    >
      <div className="flex w-9 shrink-0 flex-col items-center pt-1 font-mono text-ink-soft">
        <span className="text-sm">{String(rank).padStart(2, '0')}</span>
        <span className="text-[10px]">HEAT {Math.round(cluster.heatScore)}</span>
      </div>
      <div className="min-w-0 flex-1">
        {(cluster.analysisStatus === 'PENDING' || cluster.analysisStatus === 'RUNNING') && (
          <span className="mb-1 inline-block font-mono text-[10px] text-ink-soft">AI 분석 중…</span>
        )}
        <h3
          className={cn(
            'font-serif font-bold leading-snug text-ink',
            isTop ? 'lead-para text-[22px]' : 'text-base',
          )}
        >
          {cluster.emoji ? `${cluster.emoji} ` : ''}
          {cluster.headline}
        </h3>
        {cluster.aiSummary && (
          <p className="mt-1 line-clamp-2 font-sans text-sm text-ink-soft">{cluster.aiSummary}</p>
        )}
        {cluster.pathPreviews.length > 0 && (
          <p className="mt-1 font-mono text-[11px] text-ink-soft">
            {cluster.pathPreviews.slice(0, 2).join(' · ')}
          </p>
        )}
        {cluster.topConnections.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cluster.topConnections.slice(0, 4).map((c) => (
              <CompanyChip key={c.id} connection={c} />
            ))}
            {cluster.topConnections.length > 4 && (
              <span className="font-mono text-[11px] text-ink-soft">
                +{cluster.topConnections.length - 4}
              </span>
            )}
          </div>
        ) : (
          cluster.analysisStatus !== 'PENDING' &&
          cluster.analysisStatus !== 'RUNNING' && (
            <p className="mt-2 font-sans text-[11px] text-ink-soft">
              설명 가능한 연결을 찾지 못했습니다.
            </p>
          )
        )}
        <p className="mt-2 font-mono text-[11px] text-ink-soft">
          {mediaCount}개 매체 · {formatRelativeTime(new Date(cluster.firstSeenAt))}
        </p>
      </div>
    </Link>
  );
}
