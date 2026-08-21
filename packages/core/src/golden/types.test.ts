import { describe, expect, it } from 'vitest';
import { parseGoldenSet } from './types';

describe('parseGoldenSet', () => {
  it('실제 spec/golden/golden_set.jsonl 형태를 파싱한다', () => {
    const jsonl = [
      '{"id":"G-001","headline":"h","anchor_entity":"노루","must_include":["090350"],"must_exclude":[],"expect_type":null,"br_range":[0,30],"score_range":null,"note":"n","status":"OK"}',
      '{"id":"G-101","headline":"h2","anchor_entity":"신라","must_include":[],"must_exclude":["215600"],"expect_type":null,"br_range":null,"score_range":null,"note":"n2","status":"OK","needs_llm":true}',
    ].join('\n');
    const cases = parseGoldenSet(jsonl);
    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({
      id: 'G-001',
      anchorEntity: '노루',
      mustInclude: ['090350'],
      brRange: [0, 30],
    });
    expect(cases[1]).toMatchObject({ id: 'G-101', needsLlm: true });
  });

  it('needs_llm 생략 시 false로 기본값 처리한다', () => {
    const jsonl =
      '{"id":"G-001","headline":"h","anchor_entity":"x","must_include":[],"must_exclude":[],"expect_type":null,"br_range":null,"score_range":null,"note":"n","status":"OK"}';
    expect(parseGoldenSet(jsonl)[0]?.needsLlm).toBe(false);
  });

  it('빈 줄은 건너뛴다', () => {
    const jsonl =
      '\n{"id":"G-001","headline":"h","anchor_entity":"x","must_include":[],"must_exclude":[],"expect_type":null,"br_range":null,"score_range":null,"note":"n","status":"OK"}\n\n';
    expect(parseGoldenSet(jsonl)).toHaveLength(1);
  });

  it('알 수 없는 expect_type이면 던진다', () => {
    const jsonl =
      '{"id":"G-001","headline":"h","anchor_entity":"x","must_include":[],"must_exclude":[],"expect_type":"NOT_A_TYPE","br_range":null,"score_range":null,"note":"n","status":"OK"}';
    expect(() => parseGoldenSet(jsonl)).toThrow();
  });
});
