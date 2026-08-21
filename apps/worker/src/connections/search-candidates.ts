/**
 * T2.3.1~2.3.3 — 개체 하나에 대한 Recall 오케스트레이션. docs/09 §2 8개 룰을 실행해 후보
 * 합집합을 만들고, docs/11 §2-⑧ 재귀 CTE로 그래프를 확장한 뒤, recallScore 기준으로
 * 병합·상한(40)까지 마친 Candidate[]를 반환한다. 실제 회사/별칭/개념 스캔(IO)은 여기서 하고,
 * 판정·병합 로직은 전부 packages/core/recall의 순수 함수를 그대로 쓴다.
 */
import {
  buildAliasCandidate,
  buildGraphWalkCandidates,
  matchConcepts,
  mergeCandidates,
  planAliasEdge,
  recallByAlias,
  toCandidateFromGraphWalk,
  type GraphNodeRef,
  type KeywordMatchConfig,
  type RecallConfig,
} from '@gukjang/core';
import type { Candidate, EntityKind, Evidence, PathStep } from '@gukjang/spec';
import { schema } from '@gukjang/db';
import type { getDb } from '@gukjang/db';
import { and, eq } from 'drizzle-orm';
import { ensureGraphNode } from '../graph/ensure-node';
import { fetchNodesAndEdges, walkFromNode } from './graph-search';

export interface EntityRef {
  id: number;
  name: string;
  kind: EntityKind;
  nodeId: number;
}

async function fetchAliasRows(db: ReturnType<typeof getDb>) {
  return db
    .select({
      companyId: schema.companyAlias.companyId,
      companyName: schema.company.name,
      companyTicker: schema.company.ticker,
      alias: schema.companyAlias.alias,
      aliasNorm: schema.companyAlias.aliasNorm,
      aliasType: schema.companyAlias.aliasType,
      isAmbiguous: schema.companyAlias.isAmbiguous,
    })
    .from(schema.companyAlias)
    .innerJoin(schema.company, eq(schema.companyAlias.companyId, schema.company.id));
}

async function fetchCompanyById(db: ReturnType<typeof getDb>) {
  const rows = await db
    .select({ id: schema.company.id, ticker: schema.company.ticker, name: schema.company.name })
    .from(schema.company);
  return new Map(rows.map((r) => [r.id, { ticker: r.ticker, name: r.name }]));
}

async function fetchConceptsWithNode(db: ReturnType<typeof getDb>) {
  const rows = await db
    .select({
      id: schema.concept.id,
      name: schema.concept.name,
      nameNorm: schema.concept.nameNorm,
      nodeId: schema.graphNode.id,
    })
    .from(schema.concept)
    .innerJoin(
      schema.graphNode,
      and(eq(schema.graphNode.kind, 'CONCEPT'), eq(schema.graphNode.refId, schema.concept.id)),
    );
  return rows;
}

async function walkAndBuildCandidates(
  db: ReturnType<typeof getDb>,
  startNodeId: number,
  maxHops: number,
  cfg: RecallConfig,
) {
  const walkRows = await walkFromNode(
    db,
    startNodeId,
    maxHops,
    cfg.pruneWeightFloor,
    cfg.candidateCap,
  );
  if (walkRows.length === 0) return [];
  const { nodeById, edgeById } = await fetchNodesAndEdges(
    db,
    walkRows.flatMap((w) => w.nodeIds),
    walkRows.flatMap((w) => w.edgeIds),
  );
  return buildGraphWalkCandidates(walkRows, nodeById, edgeById, cfg);
}

export async function findCandidatesForEntity(
  db: ReturnType<typeof getDb>,
  entity: EntityRef,
  recallCfg: RecallConfig,
  keywordMatchCfg: KeywordMatchConfig,
): Promise<Candidate[]> {
  const entityNode: GraphNodeRef = { id: entity.nodeId, kind: 'ENTITY', label: entity.name };
  const companyById = await fetchCompanyById(db);

  // 1) ALIAS_EXACT / ALIAS_PREFIX / ALIAS_JAMO_SIMILAR
  const aliasRows = await fetchAliasRows(db);
  const aliasHits = recallByAlias(entity.name, aliasRows, recallCfg);

  const aliasCandidates = new Map<number, Candidate>();
  const anchorNodeByCompany = new Map<number, number>();
  for (const hit of aliasHits) {
    const companyNodeId = await ensureGraphNode(db, 'COMPANY', hit.companyId, hit.companyName);
    anchorNodeByCompany.set(hit.companyId, companyNodeId);
    const plan = planAliasEdge(hit);

    await db
      .insert(schema.graphEdge)
      .values({
        srcNodeId: entity.nodeId,
        dstNodeId: companyNodeId,
        edgeType: plan.edgeType,
        weight: plan.weight.toString(),
        confidence: plan.confidence.toString(),
        origin: 'RULE',
        evidence: plan.evidence,
      })
      .onConflictDoUpdate({
        target: [schema.graphEdge.srcNodeId, schema.graphEdge.dstNodeId, schema.graphEdge.edgeType],
        set: {
          weight: plan.weight.toString(),
          confidence: plan.confidence.toString(),
          evidence: plan.evidence,
        },
      });

    const companyNode: GraphNodeRef = {
      id: companyNodeId,
      kind: 'COMPANY',
      label: hit.companyName,
    };
    aliasCandidates.set(
      hit.companyId,
      buildAliasCandidate(hit, entity.id, entityNode, companyNode, plan, keywordMatchCfg),
    );
  }

  // 2) GRAPH_EXPAND — 확정된 기업에서 AFFILIATION 1홉 (docs/09 §2)
  const graphExpandCandidates: Candidate[] = [];
  for (const [companyId, companyNodeId] of anchorNodeByCompany) {
    const walkCandidates = await walkAndBuildCandidates(db, companyNodeId, 1, recallCfg);
    const anchor = aliasCandidates.get(companyId);
    if (!anchor) continue;
    for (const wc of walkCandidates) {
      if (wc.companyId === companyId) continue;
      const info = companyById.get(wc.companyId);
      if (!info) continue;
      graphExpandCandidates.push({
        companyId: wc.companyId,
        ticker: info.ticker,
        name: info.name,
        entityId: entity.id,
        recallRule: wc.recallRule,
        recallScore: wc.recallScore,
        path: [...anchor.path, ...wc.path.slice(1)],
        hopCount: anchor.hopCount + wc.hopCount,
        evidence: [...anchor.evidence, ...wc.evidence],
        keywordMatchScore: anchor.keywordMatchScore,
        isAmbiguousAlias: anchor.isAmbiguousAlias,
        pathEdgeConfidences: [...anchor.pathEdgeConfidences, ...wc.edgeConfidences],
        pathEdgeWeights: [...anchor.pathEdgeWeights, ...wc.edgeWeights],
      });
    }
  }

  // 3) THEME_DICT / SUPPLY_DICT — 개체 → 개념 사전 → 그래프 확장 (docs/09 §2)
  const conceptRows = await fetchConceptsWithNode(db);
  const conceptHits = matchConcepts(entity.name, conceptRows);
  const dictCandidates: Candidate[] = [];
  for (const hit of conceptHits) {
    const walkCandidates = await walkAndBuildCandidates(
      db,
      hit.conceptNodeId,
      recallCfg.maxHops,
      recallCfg,
    );
    for (const wc of walkCandidates) {
      const info = companyById.get(wc.companyId);
      if (!info) continue;
      const entityStep: PathStep = { nodeId: entity.nodeId, kind: 'ENTITY', label: entity.name };
      const conceptStep: PathStep = {
        nodeId: hit.conceptNodeId,
        kind: 'CONCEPT',
        label: hit.conceptName,
        edgeLabel: '개념 사전 매칭',
      };
      const conceptEvidence: Evidence = {
        rule: 'CONCEPT_MATCH',
        source: 'DICTIONARY',
        label: `"${entity.name}" → 개념 "${hit.conceptName}"`,
      };
      dictCandidates.push({
        companyId: wc.companyId,
        ticker: info.ticker,
        name: info.name,
        entityId: entity.id,
        recallRule: wc.recallRule,
        recallScore: wc.recallScore,
        path: [entityStep, conceptStep, ...wc.path.slice(1)],
        hopCount: wc.hopCount + 1,
        evidence: [conceptEvidence, ...wc.evidence],
        keywordMatchScore: 0,
        isAmbiguousAlias: false,
        pathEdgeConfidences: [1, ...wc.edgeConfidences],
        pathEdgeWeights: [1, ...wc.edgeWeights],
      });
    }
  }

  // 4) PERSON_DICT — 개체가 PERSON이면 엔티티 노드 자체에서 확장한다. PERSON_OF 사전이 아직
  //    없어(임원/최대주주 인물 데이터 미구축, docs/14 backlog 별도 항목) 현재는 후보가 나오지
  //    않지만, 그 사전이 채워지면 이 경로가 그대로 동작한다.
  let personCandidates: Candidate[] = [];
  if (entity.kind === 'PERSON') {
    const walkCandidates = await walkAndBuildCandidates(
      db,
      entity.nodeId,
      recallCfg.maxHops,
      recallCfg,
    );
    personCandidates = walkCandidates.flatMap((wc) => {
      const info = companyById.get(wc.companyId);
      return info ? [toCandidateFromGraphWalk(wc, entity.id, info.ticker, info.name)] : [];
    });
  }

  return mergeCandidates(
    [[...aliasCandidates.values()], graphExpandCandidates, dictCandidates, personCandidates],
    recallCfg.candidateCap,
  );
}
