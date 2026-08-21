/**
 * T2.2.1 — spec/prompts/*.md의 "## TOOL SCHEMA" 블록을 Anthropic SDK가 요구하는
 * TypeScript 형태로 옮긴 것. 프롬프트 원문(spec/prompts/*.md)이 단일 진실 원천이므로
 * 이 파일을 바꿀 땐 해당 마크다운의 TOOL SCHEMA 블록도 같은 커밋에서 함께 고칠 것
 * (spec/schema.sql ↔ packages/db/src/schema.ts와 같은 관계).
 *
 * `strict: true`(anthropic-client.ts)를 쓰려면 모든 object 레벨에 `additionalProperties:
 * false`가 있어야 하는데, 문서의 TOOL SCHEMA 블록은 가독성을 위해 이를 생략해 뒀다 —
 * 여기서만 추가한다.
 */
import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const SUMMARY_TOOL: { name: string; description: string; inputSchema: Tool.InputSchema } = {
  name: 'emit_summary',
  description: '뉴스 클러스터의 3문장 요약',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['sentences'],
    properties: {
      sentences: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: { type: 'string' },
      },
    },
  },
};

export const ENTITY_EXTRACTION_TOOL: {
  name: string;
  description: string;
  inputSchema: Tool.InputSchema;
} = {
  name: 'emit_entities',
  description: '뉴스에서 추출한 개체 목록',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['entities'],
    properties: {
      entities: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['surface', 'normalized', 'kind', 'importance', 'in_headline', 'role'],
          properties: {
            surface: { type: 'string' },
            normalized: { type: 'string' },
            kind: {
              type: 'string',
              enum: [
                'PERSON',
                'ORG',
                'PLACE',
                'PRODUCT',
                'EVENT',
                'BRAND',
                'WORD',
                'TIME',
                'NUMBER',
                'OTHER',
              ],
            },
            subtype: { type: 'string' },
            importance: { type: 'number', minimum: 0, maximum: 1 },
            in_headline: { type: 'boolean' },
            role: { type: 'string', enum: ['SUBJECT', 'OBJECT', 'CONTEXT'] },
            aliases: { type: 'array', items: { type: 'string' } },
            parent: { type: 'string' },
          },
        },
      },
    },
  },
};
