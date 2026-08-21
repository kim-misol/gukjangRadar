import { describe, expect, it } from 'vitest';
import type { GoldenCase } from './types';
import { evaluateGoldenCase, type ObservedConnection } from './evaluate';

function golden(overrides: Partial<GoldenCase> = {}): GoldenCase {
  return {
    id: 'G-TEST',
    headline: 'h',
    anchorEntity: 'x',
    mustInclude: [],
    mustExclude: [],
    expectType: null,
    brRange: null,
    scoreRange: null,
    note: '',
    status: 'OK',
    needsLlm: false,
    ...overrides,
  };
}

function conn(overrides: Partial<ObservedConnection> = {}): ObservedConnection {
  return {
    ticker: '090350',
    type: 'NAME_MATCH',
    businessRelevance: 10,
    connectionScore: 50,
    ...overrides,
  };
}

describe('evaluateGoldenCase', () => {
  it('must_include가 전부 있고 다른 조건이 없으면 PASS', () => {
    const result = evaluateGoldenCase(golden({ mustInclude: ['090350'] }), [conn()], true);
    expect(result.outcome).toBe('PASS');
  });

  it('must_include가 누락되면 FAIL (judge와 무관하게 항상)', () => {
    const result = evaluateGoldenCase(golden({ mustInclude: ['090350'] }), [], false);
    expect(result.outcome).toBe('FAIL');
    expect(result.reasons[0]).toContain('must_include 누락');
  });

  it('must_exclude 위반 + needsLlm=false → FAIL', () => {
    const result = evaluateGoldenCase(
      golden({ mustExclude: ['215600'] }),
      [conn({ ticker: '215600' })],
      true,
    );
    expect(result.outcome).toBe('FAIL');
  });

  it('must_exclude 위반 + needsLlm=true + 참조 판정기(judgeIsReal=false) → NEEDS_LLM_REVIEW', () => {
    const result = evaluateGoldenCase(
      golden({ mustExclude: ['215600'], needsLlm: true }),
      [conn({ ticker: '215600' })],
      false,
    );
    expect(result.outcome).toBe('NEEDS_LLM_REVIEW');
  });

  it('must_exclude 위반 + needsLlm=true + 실 LLM(judgeIsReal=true) → FAIL (진짜 회귀로 취급)', () => {
    const result = evaluateGoldenCase(
      golden({ mustExclude: ['215600'], needsLlm: true }),
      [conn({ ticker: '215600' })],
      true,
    );
    expect(result.outcome).toBe('FAIL');
  });

  it('expect_type 불일치면 FAIL', () => {
    const result = evaluateGoldenCase(
      golden({ mustInclude: ['090350'], expectType: 'SUPPLY_CHAIN' }),
      [conn({ type: 'NAME_MATCH' })],
      true,
    );
    expect(result.outcome).toBe('FAIL');
    expect(result.reasons[0]).toContain('expect_type');
  });

  it('br_range 벗어나면 FAIL', () => {
    const result = evaluateGoldenCase(
      golden({ mustInclude: ['090350'], brRange: [60, 100] }),
      [conn({ businessRelevance: 10 })],
      true,
    );
    expect(result.outcome).toBe('FAIL');
  });

  it('score_range 벗어나면 FAIL', () => {
    const result = evaluateGoldenCase(
      golden({ mustInclude: ['090350'], scoreRange: [80, 100] }),
      [conn({ connectionScore: 10 })],
      true,
    );
    expect(result.outcome).toBe('FAIL');
  });

  it('must_include가 비어있으면(예: 개체 0개 케이스) 연결이 없어도 PASS', () => {
    const result = evaluateGoldenCase(golden(), [], true);
    expect(result.outcome).toBe('PASS');
  });
});
