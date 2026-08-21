/**
 * T2.3.6 — 가드레일 G1~G9 공용 타입 (docs/13-validation.md §2).
 */
import type { LlmJudgement } from '@gukjang/spec';

export type GuardrailRuleId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9';

export interface GuardrailViolation {
  ruleId: GuardrailRuleId;
  detail: Record<string, unknown>;
}

/** applyGuardrails가 판정 하나를 검사하는 데 필요한 문맥. LLM 심사·경로 조립 시점에 모두 얻을 수 있다. */
export interface GuardrailContext {
  /** G1: 후보집합 — 이 안에 없는 company_id는 폐기한다 (closed-world). */
  candidateCompanyIds: readonly number[];
  /** G2: explanation에 절대 나오면 안 되는 용어(이번 후보집합 밖의 알려진 회사명·티커). */
  forbiddenMentionTerms: readonly string[];
  /** G6: business_relevance≥60 주장의 근거가 되어야 하는 문장. */
  businessSummary: string | null;
  /** G6: 경로 라벨(개체명·회사명 등) — business_summary에 이 중 하나라도 등장해야 근거로 인정. */
  pathLabels: readonly string[];
  /** G7: 재난·사망·범죄 뉴스인가 (news/entity 문맥에서 결정론적으로 판정). */
  isDangerousEvent: boolean;
  /** G8: 인물 부정 사건 뉴스인가. */
  isNegativePersonEvent: boolean;
  /** G9: 경로의 노드 id 순서 — 사이클 여부 판정용. */
  pathNodeIds: readonly number[];
  hopCount: number;
}

export interface GuardrailOutcome {
  /** false면 이 판정 자체를 저장하지 않는다(폐기). */
  passed: boolean;
  judgement: LlmJudgement;
  violations: GuardrailViolation[];
}
