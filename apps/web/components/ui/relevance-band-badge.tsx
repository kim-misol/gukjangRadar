import type { RelevanceBand } from '@gukjang/spec';

const LABEL: Record<RelevanceBand, string> = {
  HIGH: '높음',
  MEDIUM: '보통',
  LOW: '낮음',
  NONE: '—',
};

/** docs/05-screen-specs.md S2 — "사업연관성 3단계(높음·보통·낮음)". */
export function RelevanceBandBadge({ band }: { band: RelevanceBand }) {
  return <span className="font-mono text-xs text-ink-soft">{LABEL[band]}</span>;
}
