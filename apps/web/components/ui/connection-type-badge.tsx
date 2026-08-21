import { CONNECTION_KIND_META, type ConnectionKind } from '@gukjang/spec';
import { cn } from '../../lib/utils';

/** docs/05-screen-specs.md S2 — 연결 종목 리스트 행의 `ConnectionTypeBadge`. */
export function ConnectionTypeBadge({
  type,
  className,
}: {
  type: ConnectionKind;
  className?: string;
}) {
  const meta = CONNECTION_KIND_META[type];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border border-rule px-1.5 py-0.5 font-sans text-xs text-ink-soft',
        className,
      )}
    >
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  );
}
