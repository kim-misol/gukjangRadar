import { describe, expect, it } from 'vitest';
import { getOrCreateAnonId, type KeyValueStorage } from './anon-id';

function fakeStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const store = { ...initial };
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value;
    },
  };
}

describe('getOrCreateAnonId', () => {
  it('저장된 값이 있으면 그대로 재사용한다', () => {
    const storage = fakeStorage({ gr_anon_id: 'existing-id' });
    expect(getOrCreateAnonId(storage, () => 'new-id')).toBe('existing-id');
  });

  it('없으면 새로 만들어서 저장한다', () => {
    const storage = fakeStorage();
    const id = getOrCreateAnonId(storage, () => 'new-id');
    expect(id).toBe('new-id');
    expect(storage.getItem('gr_anon_id')).toBe('new-id');
  });

  it('두 번 호출해도 같은 값을 반환한다 (멱등)', () => {
    const storage = fakeStorage();
    const first = getOrCreateAnonId(storage, () => 'a');
    const second = getOrCreateAnonId(storage, () => 'b');
    expect(first).toBe(second);
  });
});
