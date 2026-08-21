'use client';

import type { EntityBrief, GraphDto } from '@gukjang/spec';
import { useEffect, useMemo, useState } from 'react';
import { ConnectionGraph } from '../graph/connection-graph';
import { EntityChips } from './entity-chips';
import { trackEvent } from '../../lib/analytics/track';

/** docs/05-screen-specs.md S2 §3~4 — 개체 칩과 그래프가 선택 상태를 공유한다. */
export function NewsDetailGraphSection({
  entities,
  graph,
}: {
  entities: EntityBrief[];
  graph: GraphDto;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  useEffect(() => {
    trackEvent('graph_open', { clusterId: graph.clusterId });
  }, [graph.clusterId]);

  const nodeIdByEntityLabel = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of graph.nodes) {
      if (node.kind === 'ENTITY' && !map.has(node.label)) map.set(node.label, node.id);
    }
    return map;
  }, [graph.nodes]);

  return (
    <div className="space-y-3">
      <EntityChips
        entities={entities}
        selectableNodeIds={nodeIdByEntityLabel}
        selectedNodeId={selectedNodeId}
        onSelect={setSelectedNodeId}
      />
      <ConnectionGraph
        graph={graph}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
      />
    </div>
  );
}
