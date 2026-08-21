/** 발행/생성 시각을 상대 시각 문자열로 표시한다 (뉴스 카드 메타, mins 필드). */
export function formatRelativeTime(target: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - target.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  return target.toISOString().slice(0, 10);
}
