import { describe, expect, it, beforeEach } from 'vitest';
import { loadEnv, __resetEnvCacheForTests } from './env';

const baseValidEnv = {
  DATABASE_URL: 'postgres://gukjang:gukjang@localhost:5432/gukjang_radar',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-secret',
};

describe('loadEnv', () => {
  beforeEach(() => {
    __resetEnvCacheForTests();
  });

  it('필수 값이 있으면 기본값과 함께 통과한다', () => {
    const env = loadEnv(baseValidEnv as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.FEATURE_PAID_PLANS_ENABLED).toBe(false);
  });

  it('DATABASE_URL이 없으면 던진다', () => {
    __resetEnvCacheForTests();
    const { DATABASE_URL: _omit, ...rest } = baseValidEnv;
    expect(() => loadEnv(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it('FEATURE_PAID_PLANS_ENABLED="true" 문자열을 boolean true로 변환한다', () => {
    const env = loadEnv({
      ...baseValidEnv,
      FEATURE_PAID_PLANS_ENABLED: 'true',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.FEATURE_PAID_PLANS_ENABLED).toBe(true);
  });
});
