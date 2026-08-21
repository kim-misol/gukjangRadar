import * as Sentry from '@sentry/nextjs';

/** T5.4 — Next.js 15 instrumentation 훅. 런타임별로 알맞은 Sentry 설정 파일을 로드한다. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
