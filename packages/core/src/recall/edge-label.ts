/**
 * T2.3.2 — 엣지 타입 → 한글 라벨 템플릿 (LLM 아님, spec/types.ts GraphEdgeDto.label 주석 그대로).
 * 연결 경로(PathStep) 표시와 그래프 컴포넌트(W6)가 함께 재사용한다.
 * 순수 함수, IO 없음 (R7).
 */
import type { EdgeKind } from '@gukjang/spec';

const EDGE_TYPE_LABELS: Record<EdgeKind, string> = {
  MENTIONS: '언급',
  NAME_MATCH: '이름 일치',
  NAME_SIMILAR: '이름 유사',
  AFFILIATION: '계열 관계',
  SUPPLY_CHAIN: '공급망',
  PRODUCES: '생산',
  BELONGS_TO: '소속',
  RELATED_CONCEPT: '연관 개념',
  PERSON_OF: '인물 소속',
  LOCATED_IN: '소재지',
  EVENT_IMPACT: '사건 영향',
};

export function edgeTypeLabel(edgeType: EdgeKind): string {
  return EDGE_TYPE_LABELS[edgeType];
}
