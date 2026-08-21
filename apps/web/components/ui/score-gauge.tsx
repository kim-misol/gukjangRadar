import { cn } from '../../lib/utils';

const TONE_CLASS = {
  blue: 'bg-[oklch(0.55_0.14_255)]',
  orange: 'bg-[oklch(0.62_0.16_55)]',
} as const;

/**
 * docs/05-screen-specs.md S1 — 연결 강도(blue)/밈력(orange) 게이지.
 * R4: 두 점수는 절대 하나로 합치지 않는다 — 항상 별개의 게이지 2개로 렌더한다.
 */
export function ScoreGauge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof TONE_CLASS;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 font-sans text-[11px] text-ink-soft">{label}</span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-rule/40"
        role="meter"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full', TONE_CLASS[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-7 shrink-0 text-right font-mono text-[11px] text-ink">{clamped}</span>
    </div>
  );
}
