/**
 * T2.3.1 — THEME_DICT/SUPPLY_DICT/PERSON_DICT의 첫 단계: 개체 이름 → 개념 사전 매칭.
 * docs/09 §2 "폭염 → 빙과 → 빙그레", "엔비디아 → HBM → SK하이닉스"의 첫 화살표.
 * 이후 개념 노드에서부터의 그래프 확장은 graph-walk.ts가 맡는다.
 * 순수 함수, IO 없음 (R7).
 */
import { normalizeName } from '../normalize/hangul';
import type { ConceptMatchHit, ConceptRow } from './types';

const MIN_MATCH_LEN = 2;

export function matchConcepts(entityName: string, rows: readonly ConceptRow[]): ConceptMatchHit[] {
  const norm = normalizeName(entityName);
  if (norm.length < MIN_MATCH_LEN) return [];

  const hits: ConceptMatchHit[] = [];
  for (const row of rows) {
    if (row.nameNorm.length < MIN_MATCH_LEN) continue;
    const matches =
      row.nameNorm === norm || norm.includes(row.nameNorm) || row.nameNorm.includes(norm);
    if (matches) {
      hits.push({ conceptId: row.id, conceptNodeId: row.nodeId, conceptName: row.name });
    }
  }
  return hits;
}
