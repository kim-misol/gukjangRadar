import type { CompanyBrief, MarketReaction } from '@gukjang/spec';
import { cn } from '../../lib/utils';
import { Sparkline } from './sparkline';

function formatCapturedAt(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(d);
}

/** docs/05-screen-specs.md S4 §1, §5 — 헤더 + 시장 반응. "규칙: 시세는 항상 기준 시각 병기". */
export function StockHeader({
  company,
  market,
  spark,
}: {
  company: CompanyBrief;
  market: MarketReaction | null;
  spark: number[];
}) {
  return (
    <header className="mb-6">
      <p className="font-mono text-xs text-ink-soft">
        {company.market} · {company.sector ?? '업종 미분류'}
      </p>
      <h1 className="mt-1 font-serif text-2xl font-bold text-ink md:text-[32px]">
        {company.name} <span className="font-mono text-lg text-ink-soft">{company.ticker}</span>
      </h1>

      {market ? (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span className="font-mono text-2xl text-ink">
            {market.price !== null ? market.price.toLocaleString('ko-KR') : '—'}
          </span>
          {market.changePct !== null && (
            <span
              className={cn('font-mono text-lg', market.changePct >= 0 ? 'text-up' : 'text-down')}
            >
              {market.changePct > 0 ? '+' : ''}
              {market.changePct}%
            </span>
          )}
          {market.volumeRatio20 !== null && (
            <span className="font-mono text-xs text-ink-soft">
              거래량 {market.volumeRatio20}배(20일 평균 대비)
            </span>
          )}
          <Sparkline values={spark} />
        </div>
      ) : (
        <p className="mt-3 font-sans text-sm text-ink-soft">아직 집계된 시세가 없습니다.</p>
      )}

      <p className="mt-2 font-mono text-[11px] text-ink-soft">
        {market
          ? `기준: ${formatCapturedAt(market.capturedAt)} ${market.isDelayed ? '(지연 시세)' : ''}`
          : '시세 연동은 진행 중입니다.'}
      </p>
    </header>
  );
}
