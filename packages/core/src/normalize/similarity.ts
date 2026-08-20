/**
 * T1.1.2 — 자모 레벤슈타인 유사도 (docs/09-prompt-company-matching.md §2).
 * sim(a,b) = 1 - lev(jamo(a), jamo(b)) / max(len(jamo(a)), len(jamo(b)))
 * 순수 함수만 둔다 (R7).
 */
import { toJamoUnits } from './hangul';

/** 두 시퀀스(문자/토큰 배열) 사이의 표준 레벤슈타인 편집거리. */
export function levenshtein<T>(a: readonly T[], b: readonly T[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      // i,j는 항상 유효 범위 안이라 아래 인덱스 접근은 절대 undefined가 아니다.
      curr[j] = Math.min(
        (prev[j] as number) + 1, // 삭제
        (curr[j - 1] as number) + 1, // 삽입
        (prev[j - 1] as number) + cost, // 치환
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] as number;
}

/**
 * 자모 단위 유사도. 0(완전 다름)~1(완전 동일).
 * docs/09 §2 예시: jamoSimilarity('원희','원익') ≈ 0.57
 */
export function jamoSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const jamoA = toJamoUnits(a);
  const jamoB = toJamoUnits(b);
  const maxLen = Math.max(jamoA.length, jamoB.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(jamoA, jamoB);
  return 1 - dist / maxLen;
}

/**
 * 두 문자열의 첫 음절(첫 글자)이 같은가.
 * docs/09 §2: "0.6 미만이라도 첫 음절이 동일하면 후보로 올린다" (ALIAS_PREFIX 병합 규칙).
 */
export function sharesFirstSyllable(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return Array.from(a)[0] === Array.from(b)[0];
}
