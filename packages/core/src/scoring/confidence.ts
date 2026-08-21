/**
 * T2.3.7 — confidence 계산 (docs/10-scoring.md §5).
 * CF = round( min(edge.confidence for edge in path) × (llm_confidence/100) × 100 )
 * 경로가 길수록(약한 고리가 있을수록) 자연히 낮아진다.
 * 순수 함수, IO 없음 (R7). 경로는 항상 최소 1개 엣지를 갖는다(schema hop_count CHECK ≥1).
 */
export function computeConfidenceScore(
  pathEdgeConfidences: number[],
  llmConfidence: number,
): number {
  const minEdgeConfidence = Math.min(...pathEdgeConfidences);
  return Math.round(minEdgeConfidence * (llmConfidence / 100) * 100);
}
