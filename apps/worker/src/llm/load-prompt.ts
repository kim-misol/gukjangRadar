/**
 * T2.2.1 — @gukjang/spec의 exports 맵(spec/package.json "./prompts/*")을 통해
 * spec/prompts/*.md를 읽는다. cwd에 의존하지 않도록 require.resolve로 실제 경로를 찾는다.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parsePromptMarkdown, type ParsedPrompt } from '@gukjang/core';

const requireFromHere = createRequire(import.meta.url);

export function loadPrompt(fileName: string): ParsedPrompt {
  const filePath = requireFromHere.resolve(`@gukjang/spec/prompts/${fileName}`);
  const markdown = readFileSync(filePath, 'utf-8');
  return parsePromptMarkdown(markdown);
}
