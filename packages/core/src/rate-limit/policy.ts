/**
 * T-없음(docs/19-remaining-work.md §7 "레이트리밋 미들웨어 없음", docs/07-api-spec.md §4).
 * 순수 함수, IO 없음 (R7) — 실제 카운트 저장/증가(Redis INCR)는 apps/web 미들웨어가 담당한다.
 */
export type RateLimitTier = 'ANONYMOUS_READ' | 'SEARCH' | 'DISCOVERY_REQUEST';

export interface RateLimitRule {
  windowSeconds: number;
  max: number;
}

/** docs/07-api-spec.md §4 표. "피드백 연결당 1회"는 DB unique 제약으로 이미 강제되어 여기 없다. */
export const DEFAULT_RATE_LIMIT_CONFIG: Record<RateLimitTier, RateLimitRule> = {
  ANONYMOUS_READ: { windowSeconds: 60, max: 120 },
  SEARCH: { windowSeconds: 60, max: 30 },
  DISCOVERY_REQUEST: { windowSeconds: 3600, max: 5 },
};

/**
 * 요청 경로·메서드로 어느 레이트리밋 등급에 속하는지 판정한다. 표에 없는 조합(피드백/북마크/
 * 관리자 등)은 null — 각자 이미 다른 방어 수단(DB unique 제약, ADMIN_API_TOKEN)을 갖고 있어
 * 이중으로 제한하지 않는다.
 */
export function classifyRateLimitTier(pathname: string, method: string): RateLimitTier | null {
  if (!pathname.startsWith('/api/v1/')) return null;
  if (method === 'POST' && pathname === '/api/v1/discovery/requests') return 'DISCOVERY_REQUEST';
  if (method !== 'GET') return null;
  if (pathname === '/api/v1/search' || pathname.startsWith('/api/v1/search/')) return 'SEARCH';
  return 'ANONYMOUS_READ';
}

/** 고정 윈도우 카운터 키. 같은 (등급,IP,윈도우) 조합은 항상 같은 키로 모인다. */
export function rateLimitWindowKey(
  tier: RateLimitTier,
  ip: string,
  nowMs: number,
  windowSeconds: number,
): string {
  const bucket = Math.floor(nowMs / (windowSeconds * 1000));
  return `ratelimit:${tier}:${ip}:${bucket}`;
}
