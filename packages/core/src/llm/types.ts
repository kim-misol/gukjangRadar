/**
 * T2.2.1 — LLM 호출 관련 순수 타입 + zod 검증 스키마.
 * tool_use 응답(JSON)을 zod로 파싱해 스키마를 강제한다 — "JSON 검증"의 실체 (docs/14 T2.2.1).
 * kind는 spec/types.ts의 ENTITY_KINDS를 그대로 쓴다 (enum 중복 정의 금지, CLAUDE.md §3).
 */
import { z } from 'zod';
import { CONNECTION_KINDS, ENTITY_KINDS, type LlmJudgement } from '@gukjang/spec';

/** llm_run.stage — schema.sql 주석 그대로 (실제 ENUM 타입은 아님). */
export type LlmStage = 'SUMMARY' | 'ENTITY' | 'MATCH' | 'EXPLAIN' | 'COUNTER';

/** llm_run.status — schema.sql 주석 그대로. */
export type LlmRunStatus = 'OK' | 'INVALID_JSON' | 'GUARDRAIL_BLOCKED' | 'ERROR';

export const SummaryOutputSchema = z.object({
  sentences: z.array(z.string().min(1)).length(3),
});
export type SummaryOutput = z.infer<typeof SummaryOutputSchema>;

const ENTITY_ROLES = ['SUBJECT', 'OBJECT', 'CONTEXT'] as const;

export const ExtractedEntitySchema = z.object({
  surface: z.string().min(1),
  normalized: z.string().min(1),
  kind: z.enum(ENTITY_KINDS),
  subtype: z.string().optional(),
  importance: z.number().min(0).max(1),
  in_headline: z.boolean(),
  role: z.enum(ENTITY_ROLES),
  aliases: z.array(z.string()).optional(),
  parent: z.string().optional(),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

export const EntityExtractionOutputSchema = z.object({
  entities: z.array(ExtractedEntitySchema).max(20),
});
export type EntityExtractionOutput = z.infer<typeof EntityExtractionOutputSchema>;

// T2.3.4 — spec/prompts/company_matching.md TOOL SCHEMA(emit_judgements) 그대로.
export const LlmJudgementRawSchema = z.object({
  company_id: z.number().int(),
  verdict: z.enum(['ACCEPT', 'REJECT']),
  connection_type: z.enum(CONNECTION_KINDS),
  business_relevance: z.number().int().min(0).max(100),
  meme: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100),
  explanation: z.string().max(60),
  caution: z.string().max(80).nullable().optional(),
  used_path_steps: z.array(z.number().int()).optional(),
});
export type LlmJudgementRaw = z.infer<typeof LlmJudgementRawSchema>;

export const CompanyMatchingOutputSchema = z.object({
  judgements: z.array(LlmJudgementRawSchema),
});
export type CompanyMatchingOutput = z.infer<typeof CompanyMatchingOutputSchema>;

/** LLM의 snake_case 원시 출력을 spec/types.ts의 LlmJudgement(camelCase)로 옮긴다. */
export function toLlmJudgement(raw: LlmJudgementRaw): LlmJudgement {
  return {
    companyId: raw.company_id,
    verdict: raw.verdict,
    connectionType: raw.connection_type,
    businessRelevance: raw.business_relevance,
    meme: raw.meme,
    confidence: raw.confidence,
    explanation: raw.explanation,
    caution: raw.caution ?? null,
    usedPathSteps: raw.used_path_steps ?? [],
  };
}
