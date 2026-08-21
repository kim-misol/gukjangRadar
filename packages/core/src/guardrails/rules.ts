/**
 * T2.3.6 — 가드레일 G1~G9 개별 규칙 (docs/13-validation.md §2).
 * 각 규칙은 판정 하나 + 문맥을 받아 위반 여부와 필요한 보정을 반환하는 순수 함수다.
 * 실제 실행은 apply.ts가 순서대로 돌리며 누적한다. IO 없음 (R7).
 */
import type { LlmJudgement } from '@gukjang/spec';
import { checkForbiddenWords } from '../copy-guard/forbidden-words';
import type { GuardrailContext, GuardrailRuleId } from './types';

export interface RuleResult {
  ruleId: GuardrailRuleId;
  violated: boolean;
  /** true면 이 판정 자체를 폐기한다(closed-world/구조 위반/하드 차단). */
  discard: boolean;
  detail: Record<string, unknown>;
  mutate?: (j: LlmJudgement) => LlmJudgement;
}

const REJECTION_TEMPLATE_EXPLANATION = '설명을 표시할 수 없습니다 — 근거 확인이 필요합니다.';
const G6_UNGROUNDED_BR_CAP = 59;
const G5_CONFIDENCE_PENALTY = 30;

function ok(ruleId: GuardrailRuleId): RuleResult {
  return { ruleId, violated: false, discard: false, detail: {} };
}

/** G1: company_id가 후보집합 안에 있어야 한다 — 없으면 항목 자체를 폐기한다. */
export function checkG1ClosedWorld(j: LlmJudgement, ctx: GuardrailContext): RuleResult {
  if (ctx.candidateCompanyIds.includes(j.companyId)) return ok('G1');
  return {
    ruleId: 'G1',
    violated: true,
    discard: true,
    detail: { companyId: j.companyId, candidateCount: ctx.candidateCompanyIds.length },
  };
}

/** G2: explanation에 후보 밖 기업명/티커가 없어야 한다 — 있으면 설명을 템플릿으로 대체한다. */
export function checkG2NoOutsideMention(j: LlmJudgement, ctx: GuardrailContext): RuleResult {
  const hit = ctx.forbiddenMentionTerms.find(
    (term) => term.length > 0 && j.explanation.includes(term),
  );
  if (!hit) return ok('G2');
  return {
    ruleId: 'G2',
    violated: true,
    discard: false,
    detail: { matchedTerm: hit },
    mutate: (judgement) => ({ ...judgement, explanation: REJECTION_TEMPLATE_EXPLANATION }),
  };
}

/** G3: 금지어 사전(R5) — explanation에 금지어가 있으면 PENDING으로 격리한다. */
export function checkG3ForbiddenWords(j: LlmJudgement): RuleResult {
  const result = checkForbiddenWords(j.explanation);
  if (!result.matched) return ok('G3');
  return {
    ruleId: 'G3',
    violated: true,
    discard: false,
    detail: { matches: result.matches.map((m) => m.word) },
  };
}

/** G4: MEME/NAME_MATCH는 business_relevance ≤ 30이어야 한다 — 초과 시 30으로 강등. */
export function checkG4MemeBusinessRelevanceCap(j: LlmJudgement): RuleResult {
  const isNameOrMeme = j.connectionType === 'MEME' || j.connectionType === 'NAME_MATCH';
  if (!isNameOrMeme || j.businessRelevance <= 30) return ok('G4');
  return {
    ruleId: 'G4',
    violated: true,
    discard: false,
    detail: { original: j.businessRelevance, capped: 30 },
    mutate: (judgement) => ({ ...judgement, businessRelevance: 30 }),
  };
}

/** G5: usedPathSteps가 비어있으면 안 된다 — 비어있으면 confidence를 감점한다. */
export function checkG5UsedPathSteps(j: LlmJudgement): RuleResult {
  if (j.usedPathSteps.length > 0) return ok('G5');
  return {
    ruleId: 'G5',
    violated: true,
    discard: false,
    detail: {},
    mutate: (judgement) => ({
      ...judgement,
      confidence: Math.max(0, judgement.confidence - G5_CONFIDENCE_PENALTY),
    }),
  };
}

/** G6: BR≥60 주장은 business_summary(+경로 라벨)에 근거 토큰이 있어야 한다 — 없으면 59로 강등
 *  (반증 검사가 없는 이번 주차의 대체 조치 — docs/15 W5 진행 기록 참고). */
export function checkG6GroundedHighRelevance(j: LlmJudgement, ctx: GuardrailContext): RuleResult {
  if (j.businessRelevance < 60) return ok('G6');
  const summary = ctx.businessSummary ?? '';
  const grounded = ctx.pathLabels.some((label) => label.length > 0 && summary.includes(label));
  if (grounded) return ok('G6');
  return {
    ruleId: 'G6',
    violated: true,
    discard: false,
    detail: { original: j.businessRelevance, capped: G6_UNGROUNDED_BR_CAP },
    mutate: (judgement) => ({ ...judgement, businessRelevance: G6_UNGROUNDED_BR_CAP }),
  };
}

/** G7: 재난·사망·범죄 뉴스에서 MEME 연결은 하드 차단한다(밈 랭킹 제외, docs/12 F5). */
export function checkG7DangerousEventNoMeme(j: LlmJudgement, ctx: GuardrailContext): RuleResult {
  if (!ctx.isDangerousEvent || j.connectionType !== 'MEME') return ok('G7');
  return { ruleId: 'G7', violated: true, discard: true, detail: {} };
}

/** G8: 인물 부정 사건에서 MEME 생성을 하드 차단한다(docs/12 F4). */
export function checkG8NegativePersonNoMeme(j: LlmJudgement, ctx: GuardrailContext): RuleResult {
  if (!ctx.isNegativePersonEvent || j.connectionType !== 'MEME') return ok('G8');
  return { ruleId: 'G8', violated: true, discard: true, detail: {} };
}

/** G9: hop_count ≤ 4, 경로에 사이클이 없어야 한다 — 위반 시 폐기. */
export function checkG9HopAndCycle(_j: LlmJudgement, ctx: GuardrailContext): RuleResult {
  const hasCycle = new Set(ctx.pathNodeIds).size !== ctx.pathNodeIds.length;
  if (ctx.hopCount <= 4 && !hasCycle) return ok('G9');
  return {
    ruleId: 'G9',
    violated: true,
    discard: true,
    detail: { hopCount: ctx.hopCount, hasCycle },
  };
}
