/**
 * T2.2.4 — 불용 개체 블랙리스트 검사 (docs/08 §6-⑤: "정부, 대통령실, 국회, 코스피, 코스닥,
 * 증권가 등 매일 나오는 것들"). 목록 자체는 DB entity_stoplist 테이블이 갖고 있고,
 * 이 함수는 그 목록(정규화된 이름 집합)을 받아 판정만 하는 순수 함수다.
 */
export function isStoplisted(nameNorm: string, stoplist: ReadonlySet<string>): boolean {
  return stoplist.has(nameNorm);
}
