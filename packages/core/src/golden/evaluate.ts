/**
 * T4.1 — 골든셋 케이스 하나를 실제 저장된 connection들과 비교해 판정한다 (docs/13 §5).
 * 순수 함수, IO 없음 (R7) — 파이프라인 실행과 connection 조회는 호출부(scripts/run-golden.ts)가 한다.
 */
import type { ConnectionKind } from '@gukjang/spec';
import type { GoldenCase } from './types';

export interface ObservedConnection {
  ticker: string;
  type: ConnectionKind;
  businessRelevance: number;
  connectionScore: number;
}

export type GoldenOutcome = 'PASS' | 'FAIL' | 'NEEDS_LLM_REVIEW';

export interface GoldenCaseEvaluation {
  id: string;
  outcome: GoldenOutcome;
  reasons: string[];
}

/**
 * judgeIsReal=false(reference judge, 실 LLM 없음)일 때 must_exclude 위반은 needs_llm 케이스에
 * 한해 FAIL이 아니라 NEEDS_LLM_REVIEW로 격하한다 — recall이 의도적으로 후보를 올리고
 * (docs/09 §2 첫음절 규칙) LLM의 REJECT만이 진짜 오탐을 막기 때문에, LLM 없이는 이 위반이
 * "recall이 망가졌다"인지 "정상이고 LLM만 있으면 걸러진다"인지 구분할 수 없다.
 */
export function evaluateGoldenCase(
  golden: GoldenCase,
  observed: readonly ObservedConnection[],
  judgeIsReal: boolean,
): GoldenCaseEvaluation {
  const reasons: string[] = [];
  const tickers = new Set(observed.map((o) => o.ticker));

  const missingIncludes = golden.mustInclude.filter((t) => !tickers.has(t));
  if (missingIncludes.length > 0) {
    reasons.push(`must_include 누락: ${missingIncludes.join(', ')}`);
  }

  const violatedExcludes = golden.mustExclude.filter((t) => tickers.has(t));
  let excludeNeedsLlm = false;
  if (violatedExcludes.length > 0) {
    if (golden.needsLlm && !judgeIsReal) {
      excludeNeedsLlm = true;
      reasons.push(
        `must_exclude 위반(참조 판정기 한계, 실 LLM 필요): ${violatedExcludes.join(', ')}`,
      );
    } else {
      reasons.push(`must_exclude 위반: ${violatedExcludes.join(', ')}`);
    }
  }

  const includedRows = observed.filter((o) => golden.mustInclude.includes(o.ticker));
  if (golden.expectType && includedRows.length > 0) {
    const wrongType = includedRows.filter((o) => o.type !== golden.expectType);
    if (wrongType.length > 0) {
      reasons.push(
        `expect_type(${golden.expectType}) 불일치: ${wrongType.map((o) => `${o.ticker}=${o.type}`).join(', ')}`,
      );
    }
  }

  if (golden.brRange) {
    const [min, max] = golden.brRange;
    const outOfRange = includedRows.filter(
      (o) => o.businessRelevance < min || o.businessRelevance > max,
    );
    if (outOfRange.length > 0) {
      reasons.push(
        `br_range[${min},${max}] 벗어남: ${outOfRange.map((o) => `${o.ticker}=${o.businessRelevance}`).join(', ')}`,
      );
    }
  }

  if (golden.scoreRange) {
    const [min, max] = golden.scoreRange;
    const outOfRange = includedRows.filter(
      (o) => o.connectionScore < min || o.connectionScore > max,
    );
    if (outOfRange.length > 0) {
      reasons.push(
        `score_range[${min},${max}] 벗어남: ${outOfRange.map((o) => `${o.ticker}=${o.connectionScore}`).join(', ')}`,
      );
    }
  }

  const hardFailReasons = reasons.filter((r) => !r.includes('참조 판정기 한계'));
  let outcome: GoldenOutcome;
  if (hardFailReasons.length > 0) outcome = 'FAIL';
  else if (excludeNeedsLlm) outcome = 'NEEDS_LLM_REVIEW';
  else outcome = 'PASS';

  return { id: golden.id, outcome, reasons };
}
