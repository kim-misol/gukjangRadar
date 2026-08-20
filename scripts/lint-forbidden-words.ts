/**
 * T0.3.1 — 금지어 CI 린터.
 * 검사 대상: 사용자에게 노출될 카피가 실제로 들어가는 곳(apps/*, packages/core의 카피 템플릿).
 * 제외: docs/**, spec/prompts/** — 정책을 설명하거나 LLM에게 "쓰지 말라"고 지시하는 문서라
 *       금지어 자체를 인용해야 하므로 스캔 대상에서 뺀다.
 *
 * 한 줄만 예외 처리하고 싶으면 같은 줄 끝에 `forbidden-words-ignore` 주석을 붙인다.
 *
 * 실행: pnpm lint-forbidden-words
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fg from 'fast-glob';
import { checkForbiddenWords } from '@gukjang/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const TARGET_GLOBS = [
  'apps/web/app/**/*.{ts,tsx,md,mdx}',
  'apps/web/components/**/*.{ts,tsx}',
  'apps/web/lib/**/*.{ts,tsx}',
  'apps/worker/src/**/*.ts',
  'packages/core/src/**/*.ts',
];

const EXCLUDE_GLOBS = [
  '**/node_modules/**',
  '**/*.test.ts',
  '**/*.spec.ts',
  'packages/core/src/copy-guard/**',
];

const IGNORE_MARKER = 'forbidden-words-ignore';

interface Violation {
  file: string;
  line: number;
  word: string;
  reason: string;
  excerpt: string;
}

function main(): void {
  const files = fg.sync(TARGET_GLOBS, {
    cwd: repoRoot,
    ignore: EXCLUDE_GLOBS,
    absolute: true,
  });

  const violations: Violation[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((lineText, i) => {
      if (lineText.includes(IGNORE_MARKER)) return;
      const { matches } = checkForbiddenWords(lineText);
      for (const m of matches) {
        violations.push({
          file: path.relative(repoRoot, file),
          line: i + 1,
          word: m.word,
          reason: m.reason,
          excerpt: lineText.trim().slice(0, 120),
        });
      }
    });
  }

  if (violations.length === 0) {
    console.log(`✓ 금지어 없음 (검사 대상 파일 ${files.length}개)`);
    process.exit(0);
  }

  console.error(`✗ 금지어 ${violations.length}건 발견:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  "${v.word}" — ${v.reason}`);
    console.error(`    > ${v.excerpt}`);
  }
  console.error(`\n검토 후 정말 예외라면 해당 줄 끝에 "// ${IGNORE_MARKER}" 주석을 추가하세요.`);
  process.exit(1);
}

main();
