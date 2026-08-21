/**
 * T2.2.1 — spec/prompts/*.md(SYSTEM/TOOL SCHEMA/USER 템플릿 구조)를 파싱한다.
 * 프롬프트 원문은 spec/prompts/*.md가 단일 진실 원천(CLAUDE.md §3) — 여기서 문자열을
 * 다시 하드코딩하지 않는다. tool JSON schema만은 SDK 호출에 타입을 붙이기 위해
 * TypeScript 쪽에 별도로 정의한다(spec/schema.sql ↔ packages/db/src/schema.ts와 같은 관계 —
 * 마크다운의 TOOL SCHEMA 블록과 같은 커밋에서 함께 고칠 것).
 * 순수 함수, 외부 IO 없음 (R7).
 */

export interface ParsedPrompt {
  promptVersion: string;
  stage: string;
  system: string;
  userTemplate: string;
}

export function parsePromptMarkdown(markdown: string): ParsedPrompt {
  const versionMatch = markdown.match(/<!--\s*version:\s*([^\s|]+)\s*\|\s*stage:\s*([^\s|]+)/);
  if (!versionMatch) {
    throw new Error('프롬프트 헤더 주석(version/stage)을 찾을 수 없음');
  }
  const promptVersion = versionMatch[1] as string;
  const stage = versionMatch[2] as string;

  const system = extractSection(markdown, '## SYSTEM', '## TOOL SCHEMA');
  const userSection = extractSection(markdown, '## USER (템플릿)', '## FEW-SHOT');
  const userTemplate = extractFencedBlock(userSection);

  return { promptVersion, stage, system, userTemplate };
}

/** `{{key}}` 자리표시자를 vars 값으로 치환한다. 없는 키는 빈 문자열로 남긴다. */
export function renderPromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}

function extractSection(markdown: string, startHeading: string, endHeading: string): string {
  const startIdx = markdown.indexOf(startHeading);
  if (startIdx === -1) {
    throw new Error(`프롬프트 섹션을 찾을 수 없음: ${startHeading}`);
  }
  const contentStart = startIdx + startHeading.length;
  const endIdx = markdown.indexOf(endHeading, contentStart);
  const content =
    endIdx === -1 ? markdown.slice(contentStart) : markdown.slice(contentStart, endIdx);
  return content.trim();
}

function extractFencedBlock(text: string): string {
  const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (!match) {
    throw new Error('프롬프트 USER 템플릿에서 코드 블록을 찾을 수 없음');
  }
  return (match[1] as string).trim();
}
