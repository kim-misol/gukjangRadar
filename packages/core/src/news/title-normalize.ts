/**
 * T2.1.2 — 제목 정규화 (docs/11-pipeline.md §2-②). 순수 함수, 외부 IO 없음 (R7).
 */

/** 선두에 반복되는 대괄호 태그(`[속보]`, `[단독]`, `[포토]` 등)를 모두 벗긴다. */
export function stripBracketPrefixes(title: string): string {
  let result = title;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/^\s*\[[^[\]]{1,10}\]\s*/, '');
  } while (result !== prev);
  return result;
}

/** 제목 끝에 붙는 매체명 접미(` - 매체명`, ` | 매체명`, ` · 매체명`)를 벗긴다. */
export function stripOutletSuffix(title: string, sourceName?: string): string {
  if (!sourceName) return title;
  const escaped = sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\s*[-|·]\\s*${escaped}\\s*$`);
  return title.replace(pattern, '');
}

/** 곡선 따옴표(“”‘’)를 직선 따옴표("')로 통일한다. */
export function unifyQuotes(text: string): string {
  return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

/** 전각 문자를 반각으로 변환한다 (전각 공백 포함). */
export function fullwidthToHalfwidth(text: string): string {
  return text
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

/**
 * 화면에 노출할 정제된 제목을 만든다.
 * 순서: NFC 정규화 → 전각→반각 → 따옴표 통일 → 대괄호 접두 제거 → 매체명 접미 제거 → 공백 정리.
 */
export function normalizeTitleForDisplay(raw: string, sourceName?: string): string {
  let t = raw.normalize('NFC');
  t = fullwidthToHalfwidth(t);
  t = unifyQuotes(t);
  t = stripBracketPrefixes(t);
  t = stripOutletSuffix(t, sourceName);
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * 클러스터링/simhash용 토큰화. 형태소 분석기 없이 한글 조사 변화에 강건하도록
 * 공백·기호를 제거한 뒤 문자 2-gram(shingle)을 쓴다.
 */
export function tokenizeForClustering(normalizedTitle: string): string[] {
  const cleaned = normalizedTitle.replace(/[^\p{L}\p{N}]/gu, '');
  if (cleaned.length === 0) return [];
  if (cleaned.length === 1) return [cleaned];

  const grams: string[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    grams.push(cleaned.slice(i, i + 2));
  }
  return grams;
}
