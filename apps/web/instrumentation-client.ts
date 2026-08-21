import * as Sentry from '@sentry/nextjs';

/**
 * T5.4 — 브라우저 에러 추적. Next.js가 `NEXT_PUBLIC_` 접두사 변수만 빌드 시점에 클라이언트
 * 번들로 인라인하므로 여기서는 loadEnv()가 아니라 raw process.env.NEXT_PUBLIC_SENTRY_DSN을
 * 읽는다(instrumentation-client.ts는 브라우저에서 실행되므로 node:fs를 쓰는 loadEnv()가
 * 애초에 동작할 수 없다).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
