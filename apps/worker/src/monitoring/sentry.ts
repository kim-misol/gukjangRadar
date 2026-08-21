import * as Sentry from '@sentry/node';
import { loadEnv } from '@gukjang/core';

/**
 * T5.4 — 파이프라인 잡 에러 추적. SENTRY_DSN이 없으면(계정 미생성 상태, docs/15 W8)
 * 아무 것도 하지 않는다. `main.ts` 최상단에서 한 번 호출한다.
 */
export function initSentry(): void {
  const dsn = loadEnv().SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0 });
}
