import * as Sentry from '@sentry/nextjs';

/**
 * T5.4 — Edge 런타임 에러 추적. 이 앱은 실제로는 edge 런타임을 쓰지 않지만(모든 라우트가
 * DB 소켓 클라이언트 때문에 nodejs 런타임 — app/api/og/connection/[id]/route.tsx 주석 참고)
 * Next.js instrumentation 관례상 파일은 있어야 한다. `@gukjang/core`의 loadEnv()는
 * node:fs/node:path를 쓰므로 edge에서 못 돈다 — 여기서는 raw process.env만 읽는다.
 */
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}
