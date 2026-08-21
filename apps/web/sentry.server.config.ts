import * as Sentry from '@sentry/nextjs';
import { loadEnv } from '@gukjang/core';

/**
 * T5.4 — 서버(Node 런타임) 에러 추적. SENTRY_DSN이 없으면(계정 미생성 상태, docs/15 W8)
 * 아무 것도 하지 않는다 — Sentry.init을 아예 호출하지 않아야 SDK가 조용히 비활성 상태로 남는다.
 */
const dsn = loadEnv().SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}
