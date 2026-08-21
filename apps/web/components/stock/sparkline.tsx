/** docs/05-screen-specs.md S4 §5 — "5일 스파크라인 (캔들 아님)". 순수 SVG 선그래프. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <p className="font-mono text-xs text-ink-soft">스파크라인을 그리기엔 데이터가 부족합니다.</p>
    );
  }

  const width = 160;
  const height = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  const up = values[values.length - 1]! >= values[0]!;

  return (
    <svg width={width} height={height} role="img" aria-label="최근 5거래일 종가 추이">
      <polyline
        points={points}
        fill="none"
        stroke={up ? 'var(--color-up)' : 'var(--color-down)'}
        strokeWidth={1.5}
      />
    </svg>
  );
}
