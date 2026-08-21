import { describe, expect, it } from 'vitest';
import { parsePromptMarkdown, renderPromptTemplate } from './parse-prompt';

const SAMPLE = `<!-- version: ee-v1 | stage: ENTITY | model: claude · temperature 0 -->

## SYSTEM

당신은 개체 추출기다.

### 규칙
1. 실제로 등장한 표현만 추출한다.

### 출력
반드시 emit_entities 도구를 호출한다.

## TOOL SCHEMA

\`\`\`json
{"name":"emit_entities"}
\`\`\`

## USER (템플릿)

\`\`\`
[HEADLINE]
{{headline}}

[SUMMARY]
{{summary}}
\`\`\`

## FEW-SHOT

**입력**: ...
`;

describe('parsePromptMarkdown', () => {
  it('버전/스테이지를 헤더 주석에서 읽는다', () => {
    const parsed = parsePromptMarkdown(SAMPLE);
    expect(parsed.promptVersion).toBe('ee-v1');
    expect(parsed.stage).toBe('ENTITY');
  });

  it('SYSTEM 섹션을 TOOL SCHEMA 앞까지 추출한다', () => {
    const parsed = parsePromptMarkdown(SAMPLE);
    expect(parsed.system).toContain('당신은 개체 추출기다');
    expect(parsed.system).toContain('실제로 등장한 표현만 추출한다');
    expect(parsed.system).not.toContain('emit_entities"');
  });

  it('USER 템플릿을 코드 블록에서 추출한다', () => {
    const parsed = parsePromptMarkdown(SAMPLE);
    expect(parsed.userTemplate).toBe('[HEADLINE]\n{{headline}}\n\n[SUMMARY]\n{{summary}}');
  });

  it('헤더 주석이 없으면 에러', () => {
    expect(() => parsePromptMarkdown('## SYSTEM\n내용')).toThrow(/헤더 주석/);
  });

  it('섹션이 없으면 에러', () => {
    const noSystem = SAMPLE.replace('## SYSTEM', '## NOTSYSTEM');
    expect(() => parsePromptMarkdown(noSystem)).toThrow(/섹션을 찾을 수 없음/);
  });
});

describe('renderPromptTemplate', () => {
  it('{{key}}를 값으로 치환한다', () => {
    const result = renderPromptTemplate('[H]\n{{headline}}\n[S]\n{{summary}}', {
      headline: '제목',
      summary: '요약',
    });
    expect(result).toBe('[H]\n제목\n[S]\n요약');
  });

  it('값이 없는 키는 빈 문자열로 남긴다', () => {
    expect(renderPromptTemplate('{{missing}}', {})).toBe('');
  });

  it('같은 키가 여러 번 나오면 모두 치환한다', () => {
    expect(renderPromptTemplate('{{a}} {{a}}', { a: 'x' })).toBe('x x');
  });
});
