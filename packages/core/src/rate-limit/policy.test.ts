import { describe, expect, it } from 'vitest';
import { classifyRateLimitTier, DEFAULT_RATE_LIMIT_CONFIG, rateLimitWindowKey } from './policy';

describe('classifyRateLimitTier (docs/07-api-spec.md §4)', () => {
  it('POST /v1/discovery/requests는 제보 등급', () => {
    expect(classifyRateLimitTier('/api/v1/discovery/requests', 'POST')).toBe('DISCOVERY_REQUEST');
  });

  it('GET /v1/search는 검색 등급', () => {
    expect(classifyRateLimitTier('/api/v1/search', 'GET')).toBe('SEARCH');
  });

  it('그 외 GET /v1/* 는 익명 조회 등급', () => {
    expect(classifyRateLimitTier('/api/v1/home', 'GET')).toBe('ANONYMOUS_READ');
    expect(classifyRateLimitTier('/api/v1/news/1', 'GET')).toBe('ANONYMOUS_READ');
  });

  it('GET /v1/discovery/requests(있다면)는 검색이 아니므로 익명 조회 등급', () => {
    expect(classifyRateLimitTier('/api/v1/discovery/requests', 'GET')).toBe('ANONYMOUS_READ');
  });

  it('레이트리밋 표에 없는 쓰기 계열(POST/DELETE)은 등급 없음(null) — 각자 별도 방어 수단을 가짐', () => {
    expect(classifyRateLimitTier('/api/v1/connections/1/feedback', 'POST')).toBeNull();
    expect(classifyRateLimitTier('/api/v1/connections/1/bookmark', 'DELETE')).toBeNull();
  });

  it('/api/v1/ 바깥 경로는 등급 없음', () => {
    expect(classifyRateLimitTier('/legal/disclaimer', 'GET')).toBeNull();
  });
});

describe('rateLimitWindowKey', () => {
  it('같은 윈도우 안의 두 시각은 같은 키를 만든다', () => {
    const windowSeconds = 60;
    const k1 = rateLimitWindowKey('ANONYMOUS_READ', '1.2.3.4', 0, windowSeconds);
    const k2 = rateLimitWindowKey('ANONYMOUS_READ', '1.2.3.4', 59_000, windowSeconds);
    expect(k1).toBe(k2);
  });

  it('윈도우를 넘어가면 다른 키를 만든다', () => {
    const windowSeconds = 60;
    const k1 = rateLimitWindowKey('ANONYMOUS_READ', '1.2.3.4', 0, windowSeconds);
    const k2 = rateLimitWindowKey('ANONYMOUS_READ', '1.2.3.4', 60_000, windowSeconds);
    expect(k1).not.toBe(k2);
  });

  it('IP가 다르면 다른 키를 만든다', () => {
    const k1 = rateLimitWindowKey('ANONYMOUS_READ', '1.2.3.4', 0, 60);
    const k2 = rateLimitWindowKey('ANONYMOUS_READ', '5.6.7.8', 0, 60);
    expect(k1).not.toBe(k2);
  });

  it('등급이 다르면 다른 키를 만든다', () => {
    const k1 = rateLimitWindowKey('ANONYMOUS_READ', '1.2.3.4', 0, 60);
    const k2 = rateLimitWindowKey('SEARCH', '1.2.3.4', 0, 60);
    expect(k1).not.toBe(k2);
  });
});

describe('DEFAULT_RATE_LIMIT_CONFIG', () => {
  it('docs/07 §4 표의 한도를 그대로 반영한다', () => {
    expect(DEFAULT_RATE_LIMIT_CONFIG.ANONYMOUS_READ).toEqual({ windowSeconds: 60, max: 120 });
    expect(DEFAULT_RATE_LIMIT_CONFIG.SEARCH).toEqual({ windowSeconds: 60, max: 30 });
    expect(DEFAULT_RATE_LIMIT_CONFIG.DISCOVERY_REQUEST).toEqual({ windowSeconds: 3600, max: 5 });
  });
});
