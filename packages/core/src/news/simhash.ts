/**
 * T2.1.2 — simhash 기반 제목 중복 탐지 (docs/11-pipeline.md §2-③).
 * news_article.simhash 컬럼이 drizzle bigint(mode:'number')라 JS safe-integer 범위를
 * 벗어나면 정밀도가 깨진다 — 그래서 64비트가 아니라 32비트 simhash를 쓴다.
 * 제목 길이가 짧은 뉴스 헤드라인 dedup에는 32비트로도 충분한 해상도다.
 */

function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 토큰(feature) 목록으로부터 32비트 simhash를 계산한다. */
export function simhash32(tokens: readonly string[]): number {
  const bitWeights = new Array<number>(32).fill(0);

  for (const token of tokens) {
    const hash = fnv1a32(token);
    for (let bit = 0; bit < 32; bit++) {
      const isSet = (hash & (1 << bit)) !== 0;
      bitWeights[bit] = (bitWeights[bit] ?? 0) + (isSet ? 1 : -1);
    }
  }

  let result = 0;
  for (let bit = 0; bit < 32; bit++) {
    if ((bitWeights[bit] ?? 0) > 0) {
      result |= 1 << bit;
    }
  }
  return result >>> 0;
}

/** 두 32비트 simhash 사이의 해밍 거리. */
export function hammingDistance32(a: number, b: number): number {
  let x = (a ^ b) >>> 0;
  let count = 0;
  while (x) {
    count += x & 1;
    x >>>= 1;
  }
  return count;
}
