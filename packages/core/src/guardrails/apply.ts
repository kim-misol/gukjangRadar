/**
 * T2.3.6 — G1~G9를 순서대로 적용하는 오케스트레이터 (docs/13 §2).
 * "순수 함수 배열" 원칙대로 rules.ts의 개별 검사를 모두 돌리고 결과를 누적한다.
 * 각 규칙은 이전 규칙들이 이미 보정한 judgement를 보고 판단한다(리듀서처럼 순차 적용) —
 * 그렇지 않으면 예를 들어 G4가 business_relevance를 30으로 이미 내려놨는데 G6이 "원래
 * 70이었으니 위반"이라며 59로 다시 덮어써 버리는 일이 생긴다. G6은 G4 이후의 값(30)을
 * 보고 60 미만이므로 통과해야 한다.
 * discard(G1/G7/G8/G9)가 하나라도 걸리면 이 판정은 저장하지 않는다.
 * IO 없음 (R7) — guardrail_violation 테이블 기록은 호출부(apps/worker)가 한다.
 */
import type { LlmJudgement } from '@gukjang/spec';
import {
  checkG1ClosedWorld,
  checkG2NoOutsideMention,
  checkG3ForbiddenWords,
  checkG4MemeBusinessRelevanceCap,
  checkG5UsedPathSteps,
  checkG6GroundedHighRelevance,
  checkG7DangerousEventNoMeme,
  checkG8NegativePersonNoMeme,
  checkG9HopAndCycle,
} from './rules';
import type { GuardrailContext, GuardrailOutcome, GuardrailViolation } from './types';

export interface GuardrailResult extends GuardrailOutcome {
  /** G3 위반 시 true — 호출부는 connection.status를 PENDING으로 두고 알람을 보낸다. */
  forcedPending: boolean;
}

// G1 위반 시 후속 검사는 의미가 없다(폐기될 항목)지만, 그래도 감사 로그를 위해 계속 돌린다.
const RULE_FNS: Array<
  (j: LlmJudgement, ctx: GuardrailContext) => ReturnType<typeof checkG1ClosedWorld>
> = [
  checkG1ClosedWorld,
  checkG2NoOutsideMention,
  (j) => checkG3ForbiddenWords(j),
  (j) => checkG4MemeBusinessRelevanceCap(j),
  (j) => checkG5UsedPathSteps(j),
  checkG6GroundedHighRelevance,
  checkG7DangerousEventNoMeme,
  checkG8NegativePersonNoMeme,
  checkG9HopAndCycle,
];

export function applyGuardrails(judgement: LlmJudgement, ctx: GuardrailContext): GuardrailResult {
  const violations: GuardrailViolation[] = [];
  let mutated = judgement;
  let discard = false;
  let forcedPending = false;

  for (const ruleFn of RULE_FNS) {
    const check = ruleFn(mutated, ctx);
    if (!check.violated) continue;
    violations.push({ ruleId: check.ruleId, detail: check.detail });
    if (check.discard) discard = true;
    if (check.ruleId === 'G3') forcedPending = true;
    if (check.mutate) mutated = check.mutate(mutated);
  }

  return { passed: !discard, judgement: mutated, violations, forcedPending };
}
