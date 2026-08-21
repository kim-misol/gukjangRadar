/**
 * T2.1.3 — 클러스터링 (docs/11-pipeline.md §2-④). 순수 함수, 외부 IO 없음 (R7).
 *
 * 2차(임베딩 코사인) 단계는 임베딩 공급자가 아직 정해지지 않아 worker에서 실제로
 * 호출되지 않는다 — articleEmbedding이 없으면 1차(자카드)만으로 판정한다. 함수 자체는
 * 공급자에 무관하게 동작하도록 만들어 뒀으니, 공급자가 정해지면 worker 쪽에서
 * embedding을 채워 넘기기만 하면 된다.
 */
import { jaccardSimilarity } from '../normalize/similarity';
import type { ClusterCandidate, ClusterMatchOptions, RepresentativeCandidate } from './types';

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_JACCARD_THRESHOLD = 0.5;
const DEFAULT_COSINE_THRESHOLD = 0.88;

/** 두 벡터 사이의 코사인 유사도. 차원이 다르거나 영벡터면 0. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 새 기사가 속할 기존 클러스터를 찾는다. 시간 창을 벗어난 클러스터는 후보에서 제외하고,
 * 1차 자카드 임계값을 넘는 것 중 (임베딩이 둘 다 있으면) 2차 코사인까지 통과한 것만
 * 후보로 남긴 뒤 자카드가 가장 높은 클러스터를 고른다. 없으면 null(새 클러스터 필요).
 */
export function findMatchingCluster(
  articleTokens: readonly string[],
  articlePublishedAt: Date,
  candidates: readonly ClusterCandidate[],
  articleEmbedding: number[] | null | undefined,
  options: ClusterMatchOptions = {},
): number | null {
  const windowMs = (options.windowHours ?? DEFAULT_WINDOW_HOURS) * 60 * 60 * 1000;
  const jaccardThreshold = options.jaccardThreshold ?? DEFAULT_JACCARD_THRESHOLD;
  const cosineThreshold = options.cosineThreshold ?? DEFAULT_COSINE_THRESHOLD;

  let best: { id: number; jaccard: number } | null = null;

  for (const candidate of candidates) {
    if (Math.abs(articlePublishedAt.getTime() - candidate.lastSeenAt.getTime()) > windowMs) {
      continue;
    }

    const jaccard = jaccardSimilarity(articleTokens, candidate.tokens);
    if (jaccard < jaccardThreshold) continue;

    if (articleEmbedding && candidate.embedding) {
      const cosine = cosineSimilarity(articleEmbedding, candidate.embedding);
      if (cosine < cosineThreshold) continue;
    }

    if (!best || jaccard > best.jaccard) {
      best = { id: candidate.id, jaccard };
    }
  }

  return best?.id ?? null;
}

/**
 * 대표 기사 선정 규칙: source_tier 최상위(숫자가 작을수록 신뢰도 높음) → 발행 최선(이른) 순.
 * candidate가 현재 대표(current)보다 나으면 true.
 */
export function isBetterRepresentative(
  candidate: RepresentativeCandidate,
  current: RepresentativeCandidate,
): boolean {
  if (candidate.sourceTier !== current.sourceTier) {
    return candidate.sourceTier < current.sourceTier;
  }
  return candidate.publishedAt.getTime() < current.publishedAt.getTime();
}
