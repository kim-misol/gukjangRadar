/**
 * T2.1.1 — URL 정규화 (docs/16-news-sources.md §1 필드 매핑: "link → url (canonical 정규화:
 * 쿼리 정렬·트래킹 파라미터 제거)", §3: "originallink를 canonical로 삼아 A층과 중복 제거").
 * 순수 함수, 외부 IO 없음 (R7).
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'igshid',
  'ref',
  'ref_src',
  'spm',
  'cmpid',
  'NB_SRC',
]);

/**
 * 트래킹 파라미터를 제거하고 남은 쿼리를 정렬해 같은 기사를 가리키는 서로 다른
 * URL(트래킹 파라미터만 다른 경우)을 같은 문자열로 모은다. 파싱 불가능한 입력은
 * 트림만 해서 그대로 돌려준다 — 잘못된 URL을 지어내지 않는다.
 */
export function canonicalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const keptParams = Array.from(url.searchParams.entries()).filter(
    ([key]) => !TRACKING_PARAMS.has(key),
  );
  keptParams.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  url.search = '';
  for (const [key, value] of keptParams) {
    url.searchParams.append(key, value);
  }

  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  url.hash = '';

  return url.toString();
}
