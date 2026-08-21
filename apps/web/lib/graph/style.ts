import type { EdgeKind, NodeKind } from '@gukjang/spec';

/** docs/05-screen-specs.md S3 — "엣지: edge_type별 색". 의미별로 묶어서 구분한다. */
export const EDGE_COLOR: Record<EdgeKind, string> = {
  MENTIONS: 'oklch(0.7 0.006 80)',
  NAME_MATCH: 'oklch(0.5 0.19 25)',
  NAME_SIMILAR: 'oklch(0.6 0.15 40)',
  AFFILIATION: 'oklch(0.5 0.14 300)',
  SUPPLY_CHAIN: 'oklch(0.42 0.12 250)',
  PRODUCES: 'oklch(0.42 0.12 250)',
  BELONGS_TO: 'oklch(0.5 0.14 300)',
  RELATED_CONCEPT: 'oklch(0.62 0.16 55)',
  PERSON_OF: 'oklch(0.55 0.1 200)',
  LOCATED_IN: 'oklch(0.55 0.1 200)',
  EVENT_IMPACT: 'oklch(0.55 0.1 130)',
};

/** docs/05-screen-specs.md S3 — "노드: 타입별 모양(뉴스=둥근사각, 개체=원, 개념=마름모, 기업=사각+티커)". */
export const NODE_SHAPE: Record<NodeKind, 'rounded-rect' | 'circle' | 'diamond' | 'rect'> = {
  NEWS: 'rounded-rect',
  ENTITY: 'circle',
  CONCEPT: 'diamond',
  COMPANY: 'rect',
};
