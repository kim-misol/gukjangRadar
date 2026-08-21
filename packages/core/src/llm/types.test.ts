import { describe, expect, it } from 'vitest';
import { SummaryOutputSchema, EntityExtractionOutputSchema } from './types';

describe('SummaryOutputSchema', () => {
  it('정확히 3문장이면 통과', () => {
    const result = SummaryOutputSchema.safeParse({ sentences: ['a', 'b', 'c'] });
    expect(result.success).toBe(true);
  });

  it('문장이 2개면 실패 (정확히 3문장 강제)', () => {
    expect(SummaryOutputSchema.safeParse({ sentences: ['a', 'b'] }).success).toBe(false);
  });

  it('문장이 4개면 실패', () => {
    expect(SummaryOutputSchema.safeParse({ sentences: ['a', 'b', 'c', 'd'] }).success).toBe(false);
  });

  it('빈 문자열 문장이 섞이면 실패', () => {
    expect(SummaryOutputSchema.safeParse({ sentences: ['a', '', 'c'] }).success).toBe(false);
  });
});

describe('EntityExtractionOutputSchema', () => {
  it('docs/08 few-shot 예시(태풍 노루)를 그대로 통과시킨다', () => {
    const result = EntityExtractionOutputSchema.safeParse({
      entities: [
        {
          surface: "태풍 '노루'",
          normalized: '태풍노루',
          kind: 'EVENT',
          subtype: 'WEATHER',
          importance: 1.0,
          in_headline: true,
          role: 'SUBJECT',
          aliases: ['제11호 태풍 노루'],
        },
        {
          surface: '노루',
          normalized: '노루',
          kind: 'WORD',
          subtype: 'TYPHOON_NAME',
          importance: 0.7,
          in_headline: true,
          role: 'SUBJECT',
          parent: "태풍 '노루'",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('개체 0개(빈 배열)도 통과한다 (R1: 억지로 채우지 않음)', () => {
    expect(EntityExtractionOutputSchema.safeParse({ entities: [] }).success).toBe(true);
  });

  it('알 수 없는 kind면 실패', () => {
    const result = EntityExtractionOutputSchema.safeParse({
      entities: [
        {
          surface: 'x',
          normalized: 'x',
          kind: 'COMPANY',
          importance: 0.5,
          in_headline: false,
          role: 'SUBJECT',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('importance가 범위를 벗어나면 실패', () => {
    const result = EntityExtractionOutputSchema.safeParse({
      entities: [
        {
          surface: 'x',
          normalized: 'x',
          kind: 'WORD',
          importance: 1.5,
          in_headline: false,
          role: 'SUBJECT',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('20개 초과면 실패', () => {
    const entities = Array.from({ length: 21 }, (_, i) => ({
      surface: `x${i}`,
      normalized: `x${i}`,
      kind: 'WORD' as const,
      importance: 0.5,
      in_headline: false,
      role: 'SUBJECT' as const,
    }));
    expect(EntityExtractionOutputSchema.safeParse({ entities }).success).toBe(false);
  });
});
