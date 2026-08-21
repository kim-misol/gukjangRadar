import type { NewsClusterDto } from '@gukjang/spec';
import Link from 'next/link';
import { formatRelativeTime } from '../../lib/format/relative-time';

/** docs/05-screen-specs.md S2 §1 — 헤드라인 + 원문 링크 + 매체 목록. */
export function NewsDetailHeader({ cluster }: { cluster: NewsClusterDto }) {
  return (
    <header className="mb-6">
      <Link href="/" className="font-mono text-xs text-ink-soft underline underline-offset-2">
        ← 목록으로
      </Link>
      <p className="mt-3 font-mono text-xs text-ink-soft">
        HEAT {Math.round(cluster.heatScore)} · {formatRelativeTime(new Date(cluster.firstSeenAt))}
      </p>
      <h1 className="mt-1 font-serif text-2xl font-bold leading-snug text-ink md:text-[32px]">
        {cluster.emoji ? `${cluster.emoji} ` : ''}
        {cluster.headline}
      </h1>
      {cluster.representativeUrl ? (
        <a
          href={cluster.representativeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block font-sans text-sm underline underline-offset-2"
        >
          원문 보기 ↗
        </a>
      ) : (
        <p className="mt-2 font-sans text-sm text-ink-soft">원문 삭제됨</p>
      )}
      {cluster.sources.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-mono text-xs text-ink-soft">
            {cluster.sources.length}개 매체
          </summary>
          <ul className="mt-1 space-y-0.5">
            {cluster.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-xs text-ink-soft underline underline-offset-2"
                >
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </header>
  );
}
