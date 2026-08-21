/**
 * T2.2.2 — "원문 20자 초과 인용 금지" 사후 검증 (docs/11 §2-⑤, docs/16 §5 체크리스트,
 * PRD D5). LLM이 규칙을 지키겠다고 프롬프트에 약속해도 강제되지 않으므로, 요약 저장 전
 * 코드로 한 번 더 검사한다 — R5 금지어 린터와 같은 자리(순수 함수 + 결정론 검사).
 */

const DEFAULT_MAX_QUOTE_LENGTH = 20;

/**
 * summary 안에서 sourceTexts 중 하나에 그대로(연속으로) 21자 이상 등장하는 구간을 찾는다.
 * 위반이 없으면 빈 배열.
 */
export function findLongVerbatimQuotes(
  summary: string,
  sourceTexts: readonly string[],
  maxQuoteLength = DEFAULT_MAX_QUOTE_LENGTH,
): string[] {
  const windowLength = maxQuoteLength + 1;
  if (summary.length < windowLength) return [];

  const violations = new Set<string>();
  for (const source of sourceTexts) {
    if (source.length < windowLength) continue;
    for (let start = 0; start + windowLength <= summary.length; start++) {
      const window = summary.slice(start, start + windowLength);
      if (source.includes(window)) {
        violations.add(window);
      }
    }
  }
  return Array.from(violations);
}

export function hasLongVerbatimQuote(
  summary: string,
  sourceTexts: readonly string[],
  maxQuoteLength = DEFAULT_MAX_QUOTE_LENGTH,
): boolean {
  return findLongVerbatimQuotes(summary, sourceTexts, maxQuoteLength).length > 0;
}
