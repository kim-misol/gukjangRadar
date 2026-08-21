import type { MoverItem } from '@gukjang/spec';
import Link from 'next/link';
import { cn } from '../../lib/utils';

/** docs/05-screen-specs.md S1 블록3 — 급등/급락 상위 10, 연결 없으면 "연결 미발견"(R1). */
export function MoverNewsBlock({
  movers,
  isPreMarket,
}: {
  movers: MoverItem[];
  isPreMarket: boolean;
}) {
  return (
    <section className="border border-rule p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-base font-bold text-ink">📈 급등·급락 종목 ↔ 뉴스</h2>
        {isPreMarket && <span className="font-mono text-[10px] text-ink-soft">전일 기준</span>}
      </div>
      {movers.length === 0 ? (
        <p className="font-sans text-xs text-ink-soft">
          아직 집계된 시세가 없습니다. 시세 연동은 W7에서 이어집니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {movers.map((m) => (
            <li key={m.company.id} className="flex items-center justify-between gap-2">
              <Link
                href={`/stock/${m.company.ticker}`}
                className="truncate font-sans text-sm text-ink underline underline-offset-2"
              >
                {m.company.name}
              </Link>
              <span
                className={cn(
                  'shrink-0 font-mono text-xs',
                  (m.market.changePct ?? 0) >= 0 ? 'text-up' : 'text-down',
                )}
              >
                {m.market.changePct === null
                  ? '—'
                  : `${m.market.changePct > 0 ? '+' : ''}${m.market.changePct}%`}
              </span>
              {m.connection ? (
                <Link
                  href={`/news/${m.connection.clusterId}`}
                  className="shrink-0 truncate font-sans text-xs text-ink-soft underline underline-offset-2"
                >
                  관련 뉴스
                </Link>
              ) : (
                <span className="shrink-0 font-sans text-xs text-ink-soft">연결 미발견</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
