/**
 * T-없음 — docs/19-remaining-work.md §7 "레이트리밋 미들웨어 없음"(W6→W7→W8 세 번 미뤄짐),
 * docs/07-api-spec.md §4. Next.js 15.5부터 미들웨어가 Node.js 런타임을 정식 지원해(edge에선
 * ioredis의 TCP 소켓을 못 쓴다) `runtime: 'nodejs'`로 지정한다.
 * 판정(등급 분류·윈도우 키)은 packages/core 순수 함수(R7)가 담당하고, 여기서는 Redis
 * INCR/EXPIRE만 수행한다 — apps/web이 이미 파이프라인 대시보드에서 Redis에 직접 붙는
 * 것과 같은 원칙(lib/api/pipeline-health.ts).
 */
import { NextResponse, type NextRequest } from 'next/server';
import Redis from 'ioredis';
import {
  classifyRateLimitTier,
  DEFAULT_RATE_LIMIT_CONFIG,
  loadEnv,
  rateLimitWindowKey,
} from '@gukjang/core';

export const config = {
  runtime: 'nodejs',
  matcher: ['/api/v1/:path*'],
};

let cachedRedis: Redis | null = null;

function getRedis(): Redis {
  if (!cachedRedis) {
    cachedRedis = new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: 1 });
  }
  return cachedRedis;
}

function clientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const tier = classifyRateLimitTier(request.nextUrl.pathname, request.method);
  if (!tier) return NextResponse.next();

  const rule = DEFAULT_RATE_LIMIT_CONFIG[tier];
  const key = rateLimitWindowKey(tier, clientIp(request), Date.now(), rule.windowSeconds);

  let count: number;
  try {
    const redis = getRedis();
    count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, rule.windowSeconds);
    }
  } catch {
    // Redis 장애 시 요청을 막지 않는다(fail-open) — counter-check.ts와 같은 원칙
    // (docs/15 W8: "이 기능이 없어도 되던 이전 동작보다 나빠지지 않는다").
    return NextResponse.next();
  }

  if (count > rule.max) {
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        detail: { tier, limit: rule.max, windowSeconds: rule.windowSeconds },
      },
      { status: 429, headers: { 'Retry-After': String(rule.windowSeconds) } },
    );
  }

  return NextResponse.next();
}
