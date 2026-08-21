import type { PathStep } from '@gukjang/spec';

/** docs/05-screen-specs.md S1/S3 — 경로 미리보기 텍스트 ("A → B → C"), LLM 아닌 템플릿. */
export function buildPathPreview(path: PathStep[]): string {
  return path.map((step) => step.label).join(' → ');
}
