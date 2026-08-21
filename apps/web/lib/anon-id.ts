const STORAGE_KEY = 'gr_anon_id';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * docs/07-api-spec.md §5 "익명 조회 전면 허용" — 피드백 1인 1회(DB unique) 판별용
 * 클라이언트 UUID. storage/generateId를 주입받아 순수하게 테스트한다.
 */
export function getOrCreateAnonId(
  storage: KeyValueStorage,
  generateId: () => string = () => crypto.randomUUID(),
): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = generateId();
  storage.setItem(STORAGE_KEY, id);
  return id;
}
