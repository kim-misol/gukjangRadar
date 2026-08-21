/**
 * T1.3.2 — "20일 평균 대비 배수" 계산. docs/06-erd.md MarketReaction.volumeRatio20.
 * KIS 단일 시세 조회 응답엔 20일 평균이 없어서, 우리 DB에 이미 쌓인 최근 스냅샷으로 직접
 * 계산한다(별도 KIS 엔드포인트 호출 불필요). 순수 함수, IO 없음 (R7).
 */
export function computeVolumeRatio20(
  todayVolume: number,
  recentDailyVolumes: number[],
): number | null {
  if (recentDailyVolumes.length === 0) return null;
  const avg = recentDailyVolumes.reduce((a, b) => a + b, 0) / recentDailyVolumes.length;
  if (avg <= 0) return null;
  return Math.round((todayVolume / avg) * 100) / 100;
}
