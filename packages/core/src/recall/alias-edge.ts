/**
 * T2.3.1/2.3.3 — 별칭 기반 Recall 히트(AliasRecallHit)를 그래프 엣지·경로·Candidate로 바꾼다.
 * R2(경로 없는 연결 금지)/R3(evidence 없는 엣지 금지)를 만족시키기 위해 별칭 매칭도
 * ENTITY→COMPANY 그래프 엣지(NAME_MATCH/NAME_SIMILAR)로 남긴다 — 실제 upsert는
 * apps/worker가 하고, 여기서는 엣지 내용(type/weight/confidence/evidence)만 결정한다.
 * 순수 함수, IO 없음 (R7).
 */
import type { Candidate, Evidence, NodeKind, PathStep } from '@gukjang/spec';
import { computeKeywordMatchScore } from '../scoring/keyword-match';
import type { KeywordMatchConfig } from '../scoring/types';
import { edgeTypeLabel } from './edge-label';
import type { AliasRecallHit } from './types';

export type AliasEdgeType = 'NAME_MATCH' | 'NAME_SIMILAR';

export interface AliasEdgePlan {
  edgeType: AliasEdgeType;
  weight: number;
  confidence: number;
  evidence: Record<string, unknown>;
}

const AMBIGUOUS_CONFIDENCE_PENALTY = 0.3;

export function planAliasEdge(hit: AliasRecallHit): AliasEdgePlan {
  const edgeType: AliasEdgeType = hit.recallRule === 'ALIAS_EXACT' ? 'NAME_MATCH' : 'NAME_SIMILAR';
  const confidence = Math.min(
    1,
    Math.max(0, hit.recallScore - (hit.isAmbiguous ? AMBIGUOUS_CONFIDENCE_PENALTY : 0)),
  );
  return {
    edgeType,
    weight: hit.recallScore,
    confidence,
    evidence: {
      rule: hit.recallRule,
      source: 'RULE',
      alias: hit.matchedAlias,
      alias_type: hit.aliasType,
      is_ambiguous: hit.isAmbiguous,
    },
  };
}

export interface GraphNodeRef {
  id: number;
  kind: NodeKind;
  label: string;
}

/** 별칭 매칭 후보 하나를 Candidate(spec/types.ts)로 조립한다. */
export function buildAliasCandidate(
  hit: AliasRecallHit,
  entityId: number,
  entityNode: GraphNodeRef,
  companyNode: GraphNodeRef,
  plan: AliasEdgePlan,
  keywordMatchCfg: KeywordMatchConfig,
): Candidate {
  const keywordMatchScore = computeKeywordMatchScore(
    {
      hasNameEdge: true,
      isExactMatch: hit.recallRule === 'ALIAS_EXACT',
      entityName: entityNode.label,
      aliasText: hit.matchedAlias,
      aliasType: hit.aliasType,
      isAmbiguous: hit.isAmbiguous,
    },
    keywordMatchCfg,
  );
  const path: PathStep[] = [
    { nodeId: entityNode.id, kind: entityNode.kind, label: entityNode.label },
    {
      nodeId: companyNode.id,
      kind: companyNode.kind,
      label: companyNode.label,
      edgeType: plan.edgeType,
      edgeLabel: edgeTypeLabel(plan.edgeType),
    },
  ];
  const evidence: Evidence = {
    rule: hit.recallRule,
    source: 'RULE',
    label: `"${hit.matchedAlias}" 별칭과 ${plan.edgeType === 'NAME_MATCH' ? '일치' : '유사'}`,
  };

  return {
    companyId: hit.companyId,
    ticker: hit.companyTicker,
    name: hit.companyName,
    entityId,
    recallRule: hit.recallRule,
    recallScore: hit.recallScore,
    path,
    hopCount: 1,
    evidence: [evidence],
    keywordMatchScore,
    isAmbiguousAlias: hit.isAmbiguous,
    pathEdgeConfidences: [plan.confidence],
    pathEdgeWeights: [plan.weight],
  };
}
