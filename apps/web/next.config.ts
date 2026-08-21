import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@gukjang/core', '@gukjang/spec'],
};

/**
 * T5.4 — SENTRY_ORG/SENTRY_PROJECT가 없으면(계정 미생성 상태, docs/15 W8) 감싸지 않는다.
 * withSentryConfig는 빌드 시 소스맵을 Sentry로 업로드하려 시도하는데, org/project가 없는
 * 채로 감싸면 `next build`가 인증 오류로 실패할 수 있어 안전하게 건너뛴다.
 */
const shouldWrapWithSentry = Boolean(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

export default shouldWrapWithSentry
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
    })
  : nextConfig;
