/**
 * T4.1 — 골든셋(spec/golden/golden_set.jsonl) 한 줄의 타입 + 파서.
 * docs/13-validation.md §5 필드 그대로. 순수 함수, IO 없음 (R7) — 파일을 읽는 IO는 호출부가 한다.
 */
import { z } from 'zod';
import { CONNECTION_KINDS } from '@gukjang/spec';

const RangeSchema = z.tuple([z.number(), z.number()]).nullable();

export const GoldenCaseSchema = z.object({
  id: z.string(),
  headline: z.string(),
  anchor_entity: z.string(),
  must_include: z.array(z.string()),
  must_exclude: z.array(z.string()),
  expect_type: z.enum(CONNECTION_KINDS).nullable(),
  br_range: RangeSchema,
  score_range: RangeSchema,
  note: z.string(),
  status: z.enum(['OK', 'TODO_FILL_TICKERS']),
  // 실 LLM(semantic 판단)이 있어야만 의미있게 검증되는 케이스 — reference judge로는
  // NEEDS_LLM_REVIEW로 보고한다(docs/13 §5, 오탐 함정 중 recall이 의도적으로 후보를 올리는 경우).
  needs_llm: z.boolean().optional().default(false),
});
export type GoldenCaseRaw = z.infer<typeof GoldenCaseSchema>;

export interface GoldenCase {
  id: string;
  headline: string;
  anchorEntity: string;
  mustInclude: string[];
  mustExclude: string[];
  expectType: GoldenCaseRaw['expect_type'];
  brRange: [number, number] | null;
  scoreRange: [number, number] | null;
  note: string;
  status: 'OK' | 'TODO_FILL_TICKERS';
  needsLlm: boolean;
}

function toGoldenCase(raw: GoldenCaseRaw): GoldenCase {
  return {
    id: raw.id,
    headline: raw.headline,
    anchorEntity: raw.anchor_entity,
    mustInclude: raw.must_include,
    mustExclude: raw.must_exclude,
    expectType: raw.expect_type,
    brRange: raw.br_range,
    scoreRange: raw.score_range,
    note: raw.note,
    status: raw.status,
    needsLlm: raw.needs_llm,
  };
}

/** golden_set.jsonl 원문(줄바꿈 구분 JSON)을 파싱한다. 빈 줄은 건너뛴다. */
export function parseGoldenSet(jsonl: string): GoldenCase[] {
  return jsonl
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => toGoldenCase(GoldenCaseSchema.parse(JSON.parse(line))));
}
