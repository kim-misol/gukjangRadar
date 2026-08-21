/**
 * T2.2.4 — 개체 정규화 (docs/08 §6: "normalized = 공백/특수문자 제거 + NFC").
 * 순수 함수, 외부 IO 없음 (R7). company용 normalizeName(normalize/hangul.ts)과 달리
 * 법인 표기((주)/주식회사) 제거는 하지 않는다 — 개체는 회사가 아니다.
 */
export function normalizeEntityName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[.,'"“”‘’·\-_/()[\]{}]/g, '')
    .replace(/\s+/g, '')
    .trim();
}
