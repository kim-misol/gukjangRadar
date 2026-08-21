/**
 * T2.2.1 — spec/prompts/*.md의 "## TOOL SCHEMA" 블록을 Anthropic SDK가 요구하는
 * TypeScript 형태로 옮긴 것. 프롬프트 원문(spec/prompts/*.md)이 단일 진실 원천이므로
 * 이 파일을 바꿀 땐 해당 마크다운의 TOOL SCHEMA 블록도 같은 커밋에서 함께 고칠 것
 * (spec/schema.sql ↔ packages/db/src/schema.ts와 같은 관계).
 *
 * `strict: true`(anthropic-client.ts)를 쓰려면 모든 object 레벨에 `additionalProperties:
 * false`가 있어야 하는데, 문서의 TOOL SCHEMA 블록은 가독성을 위해 이를 생략해 뒀다 —
 * 여기서만 추가한다.
 *
 * W7에서 실 API 키로 처음 라이브 검증하다 발견한 버그: Anthropic strict tool use는
 * `minimum`/`maximum`/`maxLength`/`minItems`/`maxItems` 같은 JSON Schema 제약 키워드를
 * 지원하지 않는다 — 붙이면 400(`tools.0.custom: For 'integer' type, properties maximum,
 * minimum are not supported`)으로 요청 자체가 실패한다(docs/15 W7 기록 참고). 값 범위는
 * 이미 있는 zod 사후 검증(SummaryOutputSchema 등, 실패 시 1회 재시도)이 실제 강제 지점이라
 * 스키마에서 빼도 안전 그물이 없어지는 게 아니다 — 여기서는 구조(required/enum/
 * additionalProperties)만 표현한다.
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
        items: { type: 'string' },
      },
    },
  },
};

export const COMPANY_MATCHING_TOOL: {
  name: string;
  description: string;
  inputSchema: Tool.InputSchema;
} = {
  name: 'emit_judgements',
  description: '제시된 후보 기업 각각에 대한 연결 심사 결과',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['judgements'],
    properties: {
      judgements: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'company_id',
            'verdict',
            'connection_type',
            'business_relevance',
            'meme',
            'confidence',
            'explanation',
          ],
          properties: {
            company_id: { type: 'integer' },
            verdict: { type: 'string', enum: ['ACCEPT', 'REJECT'] },
            connection_type: {
              type: 'string',
              enum: [
                'DIRECT',
                'SUPPLY_CHAIN',
                'THEME',
                'PERSON',
                'PRODUCT',
                'LOCATION',
                'EVENT',
                'KEYWORD',
                'NAME_MATCH',
                'AFFILIATION',
                'MEME',
              ],
            },
            business_relevance: { type: 'integer' },
            meme: { type: 'integer' },
            confidence: { type: 'integer' },
            explanation: { type: 'string' },
            caution: { type: ['string', 'null'] },
            used_path_steps: { type: 'array', items: { type: 'integer' } },
          },
        },
      },
    },
  },
};

export const COUNTER_CHECK_TOOL: {
  name: string;
  description: string;
  inputSchema: Tool.InputSchema;
} = {
  name: 'emit_counter_check',
  description: '기존 연결 주장에 대한 반증 검사 결과',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['refuted', 'reason', 'adjusted_relevance'],
    properties: {
      refuted: { type: 'boolean' },
      reason: { type: 'string' },
      adjusted_relevance: { type: 'integer' },
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
            importance: { type: 'number' },
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
