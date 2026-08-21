import { describe, expect, it } from 'vitest';
import type { LlmJudgement } from '@gukjang/spec';
import { applyGuardrails } from './apply';
import type { GuardrailContext } from './types';

function baseJudgement(overrides: Partial<LlmJudgement> = {}): LlmJudgement {
  return {
    companyId: 1,
    verdict: 'ACCEPT',
    connectionType: 'NAME_MATCH',
    businessRelevance: 10,
    meme: 85,
    confidence: 90,
    explanation: '뉴스의 이름과 회사명이 일치합니다.',
    caution: null,
    usedPathSteps: [1, 2],
    ...overrides,
  };
}

function baseCtx(overrides: Partial<GuardrailContext> = {}): GuardrailContext {
  return {
    candidateCompanyIds: [1, 2, 3],
    forbiddenMentionTerms: ['신라젠', '215600'],
    businessSummary: '노루페인트는 도료·페인트 제조업을 영위한다.',
    pathLabels: ['노루', '노루페인트'],
    isDangerousEvent: false,
    isNegativePersonEvent: false,
    pathNodeIds: [10, 11],
    hopCount: 1,
    ...overrides,
  };
}

describe('applyGuardrails', () => {
  it('아무 위반이 없으면 그대로 통과한다', () => {
    const result = applyGuardrails(baseJudgement(), baseCtx());
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.judgement).toEqual(baseJudgement());
  });

  it('G1: 후보집합 밖 company_id는 폐기한다', () => {
    const result = applyGuardrails(baseJudgement({ companyId: 999 }), baseCtx());
    expect(result.passed).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain('G1');
  });

  it('G2: 후보 밖 기업명이 explanation에 있으면 템플릿으로 대체한다', () => {
    const result = applyGuardrails(
      baseJudgement({ explanation: '신라젠과 유사한 이름입니다.' }),
      baseCtx(),
    );
    expect(result.passed).toBe(true); // 폐기는 아니고 설명만 대체
    expect(result.judgement.explanation).not.toContain('신라젠');
    expect(result.violations.map((v) => v.ruleId)).toContain('G2');
  });

  it('G3: 금지어가 있으면 forcedPending=true', () => {
    const result = applyGuardrails(
      baseJudgement({ explanation: '이 종목은 매수 적기입니다.' }),
      baseCtx(),
    );
    expect(result.forcedPending).toBe(true);
    expect(result.violations.map((v) => v.ruleId)).toContain('G3');
  });

  it('G4: MEME/NAME_MATCH인데 BR>30이면 30으로 강등한다', () => {
    const result = applyGuardrails(
      baseJudgement({ connectionType: 'NAME_MATCH', businessRelevance: 70 }),
      baseCtx(),
    );
    expect(result.judgement.businessRelevance).toBe(30);
    expect(result.violations.map((v) => v.ruleId)).toContain('G4');
  });

  it('G5: usedPathSteps가 비어있으면 confidence를 30점 감점한다', () => {
    const result = applyGuardrails(baseJudgement({ usedPathSteps: [], confidence: 90 }), baseCtx());
    expect(result.judgement.confidence).toBe(60);
    expect(result.violations.map((v) => v.ruleId)).toContain('G5');
  });

  it('G6: BR≥60인데 business_summary에 근거가 없으면 59로 강등한다', () => {
    const result = applyGuardrails(
      baseJudgement({ connectionType: 'SUPPLY_CHAIN', businessRelevance: 85 }),
      baseCtx({
        businessSummary: '전혀 관련 없는 사업 설명입니다.',
        pathLabels: ['HBM', 'AI가속기'],
      }),
    );
    expect(result.judgement.businessRelevance).toBe(59);
    expect(result.violations.map((v) => v.ruleId)).toContain('G6');
  });

  it('G6: 근거 토큰이 business_summary에 있으면 통과한다', () => {
    const result = applyGuardrails(
      baseJudgement({ connectionType: 'DIRECT', businessRelevance: 85 }),
      baseCtx({
        businessSummary: '노루페인트는 도료·페인트 제조업을 영위한다.',
        pathLabels: ['노루페인트'],
      }),
    );
    expect(result.judgement.businessRelevance).toBe(85);
    expect(result.violations.map((v) => v.ruleId)).not.toContain('G6');
  });

  it('G7: 재난 뉴스에서 MEME 연결은 폐기한다', () => {
    const result = applyGuardrails(
      baseJudgement({ connectionType: 'MEME' }),
      baseCtx({ isDangerousEvent: true }),
    );
    expect(result.passed).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain('G7');
  });

  it('G8: 인물 부정 사건에서 MEME 연결은 폐기한다', () => {
    const result = applyGuardrails(
      baseJudgement({ connectionType: 'MEME' }),
      baseCtx({ isNegativePersonEvent: true }),
    );
    expect(result.passed).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain('G8');
  });

  it('G9: hop_count>4면 폐기한다', () => {
    const result = applyGuardrails(baseJudgement(), baseCtx({ hopCount: 5 }));
    expect(result.passed).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain('G9');
  });

  it('G9: 경로에 사이클이 있으면 폐기한다', () => {
    const result = applyGuardrails(baseJudgement(), baseCtx({ pathNodeIds: [10, 11, 10] }));
    expect(result.passed).toBe(false);
    expect(result.violations.map((v) => v.ruleId)).toContain('G9');
  });

  it('G4가 먼저 BR을 30으로 내리면, G6은 이미 낮아진 값을 보고 통과한다(재보정 덮어쓰기 금지)', () => {
    // 원본 BR=70은 G6(≥60) 기준으로도 위반이지만, G4가 먼저 NAME_MATCH 상한(30)을 적용하면
    // 그 결과(30)는 더 이상 G6 대상이 아니다 — 순차 적용이 아니면 G6이 30을 59로 덮어써 버린다.
    const result = applyGuardrails(
      baseJudgement({ connectionType: 'NAME_MATCH', businessRelevance: 70 }),
      baseCtx({ businessSummary: '전혀 관련 없는 사업 설명입니다.', pathLabels: ['무관한개체'] }),
    );
    expect(result.judgement.businessRelevance).toBe(30);
    expect(result.violations.map((v) => v.ruleId)).toContain('G4');
    expect(result.violations.map((v) => v.ruleId)).not.toContain('G6');
  });

  it('여러 위반이 동시에 누적된다', () => {
    const result = applyGuardrails(
      baseJudgement({ connectionType: 'NAME_MATCH', businessRelevance: 70, usedPathSteps: [] }),
      baseCtx(),
    );
    const ruleIds = result.violations.map((v) => v.ruleId);
    expect(ruleIds).toContain('G4');
    expect(ruleIds).toContain('G5');
    expect(result.judgement.businessRelevance).toBe(30);
    expect(result.judgement.confidence).toBe(60);
  });
});
