'use client';

import type { GraphDto, GraphEdgeDto, GraphNodeDto } from '@gukjang/spec';
import { useEffect, useMemo, useRef, useState } from 'react';
import { connectedNodeAndEdgeIds } from '../../lib/graph/highlight';
import { layoutGraph, type Point } from '../../lib/graph/layout';
import { EDGE_COLOR, NODE_SHAPE } from '../../lib/graph/style';

const WIDTH = 720;
const ROW_HEIGHT = 60;
const MIN_HEIGHT = 240;
const NODE_R = 20;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function nodeLabel(node: GraphNodeDto): string {
  if (node.kind === 'COMPANY' && node.ticker) return `${node.label} (${node.ticker})`;
  return node.label;
}

/**
 * docs/05-screen-specs.md S3 — 뉴스 상세의 핵심 컴포넌트. d3-force로 레이아웃을 미리 계산하고
 * (`lib/graph/layout.ts`) SVG로 정적 렌더한다. 텍스트 폴백(`graph.textPaths`)은 항상 DOM에 둔다
 * (스크린리더·SEO·공유, prefers-reduced-motion과 무관하게 필수).
 */
export function ConnectionGraph({
  graph,
  selectedNodeId = null,
  onSelectNode,
}: {
  graph: GraphDto;
  /** 제어 컴포넌트 — 뉴스 상세의 "핵심 개체 칩" 클릭과 하이라이트를 공유하기 위함. */
  selectedNodeId?: number | null;
  onSelectNode?: (nodeId: number | null) => void;
}) {
  const reducedMotion = useReducedMotion();
  const laneCounts = [0, 1, 2, 3].map((lane) => graph.nodes.filter((n) => n.lane === lane).length);
  const height = Math.max(MIN_HEIGHT, Math.max(1, ...laneCounts) * ROW_HEIGHT);

  const positions = useMemo(
    () => layoutGraph(graph, { width: WIDTH, height, reducedMotion }),
    [graph, height, reducedMotion],
  );

  const [selectedEdge, setSelectedEdge] = useState<GraphEdgeDto | null>(null);
  const [panelNode, setPanelNode] = useState<GraphNodeDto | null>(null);

  const highlight = useMemo(
    () => (selectedNodeId === null ? null : connectedNodeAndEdgeIds(graph, selectedNodeId)),
    [graph, selectedNodeId],
  );

  const initialViewBox = { x: 0, y: 0, w: WIDTH, h: height };
  const [viewBox, setViewBox] = useState(initialViewBox);
  useEffect(() => setViewBox({ x: 0, y: 0, w: WIDTH, h: height }), [height]);

  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const dragStart = useRef<{ viewBox: typeof viewBox; mid: Point } | null>(null);

  const toSvgPoint = (clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h,
    };
  };

  const midpoint = (pts: Point[]): Point | null => {
    const [a, b] = pts;
    if (!a) return null;
    if (!b) return a;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const distance = (pts: Point[]): number | null => {
    const [a, b] = pts;
    if (!a || !b) return null;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const mid = midpoint([...pointers.current.values()]);
    if (mid) dragStart.current = { viewBox, mid };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const prevPts = [...pointers.current.values()];
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const svg = svgRef.current;
    if (!svg || !dragStart.current) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = dragStart.current.viewBox.w / rect.width;
    const scaleY = dragStart.current.viewBox.h / rect.height;

    const prevDist = distance(prevPts);
    const dist = distance(pts);
    if (prevDist !== null && dist !== null) {
      const factor = prevDist > 0 ? prevDist / Math.max(dist, 1) : 1;
      setViewBox((vb) => clampViewBox({ ...vb, w: vb.w * factor, h: vb.h * factor }));
      return;
    }

    const dx = (e.clientX - dragStart.current.mid.x) * scaleX;
    const dy = (e.clientY - dragStart.current.mid.y) * scaleY;
    setViewBox({
      ...dragStart.current.viewBox,
      x: dragStart.current.viewBox.x - dx,
      y: dragStart.current.viewBox.y - dy,
    });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    const mid = midpoint([...pointers.current.values()]);
    dragStart.current = mid ? { viewBox, mid } : null;
  };

  const clampViewBox = (vb: typeof viewBox) => ({
    ...vb,
    w: Math.max(WIDTH * 0.3, Math.min(WIDTH * 3, vb.w)),
    h: Math.max(height * 0.3, Math.min(height * 3, vb.h)),
  });

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const focus = toSvgPoint(e.clientX, e.clientY) ?? {
      x: viewBox.x + viewBox.w / 2,
      y: viewBox.y + viewBox.h / 2,
    };
    setViewBox((vb) => {
      const next = clampViewBox({ ...vb, w: vb.w * factor, h: vb.h * factor });
      return {
        ...next,
        x: focus.x - ((focus.x - vb.x) / vb.w) * next.w,
        y: focus.y - ((focus.y - vb.y) / vb.h) * next.h,
      };
    });
  };

  const resetView = () => setViewBox(initialViewBox);

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        width="100%"
        height={height}
        role="img"
        aria-label="뉴스와 종목의 연결 그래프"
        className="touch-none select-none border border-rule bg-paper"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={resetView}
      >
        {graph.edges.map((edge) => {
          const src = positions.get(edge.src);
          const dst = positions.get(edge.dst);
          if (!src || !dst) return null;
          const dimmed = highlight ? !highlight.edgeIds.has(edge.id) : false;
          return (
            <g key={edge.id}>
              <line
                x1={src.x}
                y1={src.y}
                x2={dst.x}
                y2={dst.y}
                stroke={EDGE_COLOR[edge.type]}
                strokeWidth={1 + edge.weight * 3}
                strokeDasharray={edge.evidence ? undefined : '4 3'}
                opacity={dimmed ? 0.15 : 0.7}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedEdge(edge);
                  setPanelNode(null);
                }}
              />
            </g>
          );
        })}

        {graph.nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const dimmed = highlight ? !highlight.nodeIds.has(node.id) : false;
          const selected = selectedNodeId === node.id;
          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              opacity={dimmed ? 0.2 : 1}
              className="cursor-pointer"
              onClick={() => {
                onSelectNode?.(selectedNodeId === node.id ? null : node.id);
                setSelectedEdge(null);
                setPanelNode(node.kind === 'COMPANY' ? node : null);
              }}
            >
              <NodeShape kind={node.kind} selected={selected} />
              <text y={NODE_R + 14} textAnchor="middle" className="fill-ink font-sans text-[10px]">
                {truncate(nodeLabel(node), 12)}
              </text>
              <title>{nodeLabel(node)}</title>
            </g>
          );
        })}
      </svg>

      {graph.truncated && (
        <p className="mt-1 font-mono text-[11px] text-ink-soft">
          연결이 많아 상위 연결 기준으로 일부만 표시했습니다.
        </p>
      )}

      {selectedEdge && (
        <div className="mt-2 border border-rule-strong bg-paper p-3 font-sans text-xs text-ink">
          <p className="font-bold">{selectedEdge.label}</p>
          {selectedEdge.evidence ? (
            <>
              <p className="mt-1 text-ink-soft">{selectedEdge.evidence.label}</p>
              {selectedEdge.evidence.url && (
                <a
                  href={selectedEdge.evidence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block underline underline-offset-2"
                >
                  출처 보기
                </a>
              )}
            </>
          ) : (
            <p className="mt-1 text-ink-soft">미검증 — 근거 출처가 없습니다.</p>
          )}
          <p className="mt-1 font-mono text-[10px] text-ink-soft">
            확신도 {Math.round(selectedEdge.confidence * 100)}%
          </p>
        </div>
      )}

      {panelNode && panelNode.kind === 'COMPANY' && (
        <div className="mt-2 border border-rule-strong bg-paper p-3 font-sans text-xs text-ink">
          <p className="font-serif text-sm font-bold">
            {panelNode.label} {panelNode.ticker && `(${panelNode.ticker})`}
          </p>
          <p className="mt-1 text-ink-soft">종목 상세는 다음 스텝(W7)에서 이어집니다.</p>
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer font-mono text-[11px] text-ink-soft">
          텍스트로 보기
        </summary>
        <ul className="mt-1 space-y-1 font-sans text-xs text-ink-soft">
          {graph.textPaths.map((path, i) => (
            <li key={i}>{path}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function NodeShape({ kind, selected }: { kind: GraphNodeDto['kind']; selected: boolean }) {
  const shape = NODE_SHAPE[kind];
  const stroke = selected ? 'oklch(0.16 0.006 80)' : 'oklch(0.5 0.006 80)';
  const strokeWidth = selected ? 2.5 : 1.5;
  const fill = 'var(--color-paper)';

  if (shape === 'circle') {
    return <circle r={NODE_R} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  if (shape === 'diamond') {
    const r = NODE_R;
    return (
      <polygon
        points={`0,-${r} ${r},0 0,${r} -${r},0`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
  const rx = shape === 'rounded-rect' ? 8 : 2;
  return (
    <rect
      x={-NODE_R}
      y={-NODE_R * 0.8}
      width={NODE_R * 2}
      height={NODE_R * 1.6}
      rx={rx}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}
