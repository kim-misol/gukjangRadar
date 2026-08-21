import type { NodeKind, PathStep } from '@gukjang/spec';

const KIND_ICON: Record<NodeKind, string> = {
  NEWS: '📰',
  ENTITY: '🔤',
  CONCEPT: '🧭',
  COMPANY: '🏢',
};

/** docs/05-screen-specs.md S4 §3 — "왜 발견됐나요? 경로를 세로 스텝으로". */
export function PathSteps({ path }: { path: PathStep[] }) {
  if (path.length === 0) {
    return <p className="font-sans text-sm text-ink-soft">경로 정보가 없습니다.</p>;
  }

  return (
    <ol className="space-y-2">
      {path.map((step, i) => (
        <li key={`${step.nodeId}-${i}`}>
          {i > 0 && (
            <p className="ml-3 font-mono text-xs text-ink-soft">↓ {step.edgeLabel ?? '연관'}</p>
          )}
          <p className="flex items-center gap-2 font-sans text-sm text-ink">
            <span aria-hidden>{KIND_ICON[step.kind]}</span>
            {step.label}
          </p>
        </li>
      ))}
    </ol>
  );
}
