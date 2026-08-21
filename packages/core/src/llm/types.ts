/**
 * T2.2.1 — LLM 호출 관련 순수 타입 + zod 검증 스키마.
 * tool_use 응답(JSON)을 zod로 파싱해 스키마를 강제한다 — "JSON 검증"의 실체 (docs/14 T2.2.1).
 * kind는 spec/types.ts의 ENTITY_KINDS를 그대로 쓴다 (enum 중복 정의 금지, CLAUDE.md §3).
 */
import { z } from 'zod';
import { ENTITY_KINDS } from '@gukjang/spec';

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
