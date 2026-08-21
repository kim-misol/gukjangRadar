import { describe, expect, it } from 'vitest';
import { decideCanonicalMerge } from './canonical-merge';

describe('decideCanonicalMerge (docs/08-prompt-entity-extraction.md §6-④)', () => {
  it('둘 다 루트(canonical_id 없음)면 id가 더 작은 쪽이 canonical, 큰 쪽이 강등된다', () => {
    expect(
      decideCanonicalMerge({ id: 10, canonicalId: null }, { id: 20, canonicalId: null }),
    ).toEqual({ canonicalId: 10, demotedRootId: 20 });
  });

  it('인자 순서를 바꿔도 결과는 동일하다', () => {
    expect(
      decideCanonicalMerge({ id: 20, canonicalId: null }, { id: 10, canonicalId: null }),
    ).toEqual({ canonicalId: 10, demotedRootId: 20 });
  });

  it('이미 같은 루트를 가리키고 있으면(이미 병합됨) null', () => {
    expect(
      decideCanonicalMerge({ id: 20, canonicalId: 10 }, { id: 30, canonicalId: 10 }),
    ).toBeNull();
  });

  it('한쪽이 이미 루트이고 다른 쪽도 아직 루트면 id가 작은 쪽이 이긴다', () => {
    expect(
      decideCanonicalMerge({ id: 10, canonicalId: null }, { id: 30, canonicalId: null }),
    ).toEqual({ canonicalId: 10, demotedRootId: 30 });
  });

  it('두 루트가 서로 다르면 더 큰 루트가 강등된다(각자 이미 다른 그룹에 속해 있던 경우)', () => {
    expect(decideCanonicalMerge({ id: 25, canonicalId: 20 }, { id: 35, canonicalId: 30 })).toEqual({
      canonicalId: 20,
      demotedRootId: 30,
    });
  });

  it('동일 entity(같은 id, 같은 canonicalId)면 null', () => {
    expect(
      decideCanonicalMerge({ id: 10, canonicalId: null }, { id: 10, canonicalId: null }),
    ).toBeNull();
  });
});
