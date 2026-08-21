import type { ConnectionDto } from '@gukjang/spec';
import Link from 'next/link';
import { ConnectionTypeBadge } from '../ui/connection-type-badge';

/** docs/05-screen-specs.md S1 블록4 — 최근 60분 신규 연결. */
export function RecentConnectionsBlock({ connections }: { connections: ConnectionDto[] }) {
  return (
    <section className="border border-rule p-4">
      <h2 className="mb-3 font-serif text-base font-bold text-ink">🧭 새로 발견된 연결</h2>
      {connections.length === 0 ? (
        <p className="font-sans text-xs text-ink-soft">
          최근 1시간 동안 새로 발견된 연결이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {connections.map((c) => (
            <li key={c.id}>
              <Link
                href={`/news/${c.clusterId}`}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate font-sans text-sm text-ink">{c.company.name}</span>
                <ConnectionTypeBadge type={c.type} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
