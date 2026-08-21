import { describe, expect, it } from 'vitest';
import type { ConceptRow } from './types';
import { matchConcepts } from './concept-match';

const HBM: ConceptRow = { id: 1, nodeId: 101, name: 'HBM', nameNorm: 'hbm' };
const AI_ACCEL: ConceptRow = { id: 2, nodeId: 102, name: 'AI가속기', nameNorm: 'ai가속기' };

describe('matchConcepts', () => {
  it('개체 이름이 개념 이름과 정확히 일치하면 매칭된다', () => {
    const hits = matchConcepts('AI 가속기', [AI_ACCEL]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.conceptId).toBe(2);
  });

  it('개체 이름이 개념 이름을 포함하면(예: HBM4) 매칭된다', () => {
    const hits = matchConcepts('HBM4', [HBM]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.conceptId).toBe(1);
  });

  it('무관한 이름은 매칭되지 않는다', () => {
    const hits = matchConcepts('태풍 노루', [HBM, AI_ACCEL]);
    expect(hits).toHaveLength(0);
  });

  it('한 글자 개체는 매칭하지 않는다(잡음 방지)', () => {
    const hits = matchConcepts('가', [HBM, AI_ACCEL]);
    expect(hits).toHaveLength(0);
  });
});
