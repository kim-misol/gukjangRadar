/**
 * ANTHROPIC_API_KEY 없이(이 샌드박스 환경 포함) 연결 엔진(T2.3)을 검증하기 위한
 * 결정론적 "참조 판정기" — 실 LLM 심사(spec/prompts/company_matching.md)를 흉내낸 대역이다.
 *
 * 주의: 이건 recallRule → connection_type의 고정 매핑일 뿐, company_matching.md §"연결 유형
 * 결정 트리"가 요구하는 의미 판단("이 개체가 실제로 그 회사를 가리키는가?")은 전혀 하지 않는다.
 * R1(LLM은 후보 집합 안에서만 검증·분류)의 "검증" 역할을 대신할 수 없다 — 실제로는 항상
 * ACCEPT만 반환하므로 신라/신라젠류 오탐 함정(needs_llm 케이스)은 이 판정기로 절대 걸러지지
 * 않는다. scripts/run-golden.ts와 scripts/manual-verify-connections.ts가 ANTHROPIC_API_KEY가
 * 없을 때만 이 대역을 쓴다 — 프로덕션 파이프라인(apps/worker)에는 절대 연결하지 않는다.
 */
import type {
  AnthropicLlmClient,
  CallToolParams,
  CallToolResult,
} from '../../apps/worker/src/llm/anthropic-client';

export function fakeToolResult<T>(
  data: T,
  inputTokens = 500,
  outputTokens = 200,
): CallToolResult<T> {
  return {
    output: data,
    usage: { inputTokens, outputTokens },
    latencyMs: 1,
    rawOutput: data,
    attempts: 1,
  };
}

/** recallRule → company_matching.md 결정 트리를 단순화한 고정 판정 (위 경고 참고). */
export function referenceJudgementFor(
  companyId: number,
  recallRule: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    company_id: companyId,
    verdict: 'ACCEPT',
    confidence: 90,
  };
  switch (recallRule) {
    case 'ALIAS_EXACT':
      Object.assign(base, {
        connection_type: 'NAME_MATCH',
        business_relevance: 10,
        meme: 85,
        explanation: '이름이 그대로 일치합니다.',
        caution: '사업 연관성은 확인되지 않습니다.',
        used_path_steps: [0, 1],
      });
      break;
    case 'ALIAS_PREFIX':
    case 'ALIAS_JAMO_SIMILAR':
      Object.assign(base, {
        connection_type: 'MEME',
        business_relevance: 15,
        meme: 75,
        explanation: '표기가 유사해 화제가 될 수 있습니다.',
        caution: '사업 연관성은 확인되지 않습니다.',
        used_path_steps: [0, 1],
      });
      break;
    case 'GRAPH_EXPAND':
      Object.assign(base, {
        connection_type: 'AFFILIATION',
        business_relevance: 8,
        meme: 70,
        explanation: '지주회사 관계로 연결됩니다.',
        caution: '이름 일치에서 파생된 연결입니다.',
        used_path_steps: [0, 1, 2],
      });
      break;
    case 'SUPPLY_DICT':
      Object.assign(base, {
        connection_type: 'SUPPLY_CHAIN',
        business_relevance: 75,
        meme: 0,
        explanation: '공급망으로 연결됩니다.',
        caution: null,
        used_path_steps: [0, 1, 2],
      });
      break;
    case 'PERSON_DICT':
      Object.assign(base, {
        connection_type: 'PERSON',
        business_relevance: 60,
        meme: 0,
        explanation: '인물 관계로 연결됩니다.',
        caution: null,
        used_path_steps: [0, 1],
      });
      break;
    default:
      Object.assign(base, {
        connection_type: 'THEME',
        business_relevance: 40,
        meme: 10,
        explanation: '테마로 연결됩니다.',
        caution: null,
        used_path_steps: [0, 1],
      });
  }
  return { ...base, ...overrides };
}

/**
 * candidates(찾은 후보)에 대해서만 참조 판정을 내리는 fake AnthropicLlmClient.
 * overridesByCompanyId로 특정 회사의 판정 필드를 강제할 수 있다(가드레일 시나리오 테스트용).
 */
export function makeReferenceJudgeClient(
  candidates: readonly { companyId: number; recallRule: string }[],
  overridesByCompanyId: ReadonlyMap<number, Record<string, unknown>> = new Map(),
): Pick<AnthropicLlmClient, 'callTool'> {
  const judgements = candidates.map((c) =>
    referenceJudgementFor(c.companyId, c.recallRule, overridesByCompanyId.get(c.companyId) ?? {}),
  );
  return {
    callTool: async <T>(params: CallToolParams<T>): Promise<CallToolResult<T>> => {
      const parsed = params.parseOutput({ judgements });
      if (!parsed.success)
        throw new Error(`reference judge 출력이 스키마 검증 실패: ${parsed.error}`);
      return fakeToolResult(parsed.data);
    },
  };
}
