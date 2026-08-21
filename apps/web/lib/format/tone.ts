import type { ConnectionKind } from '@gukjang/spec';

/** 억지 관련주 정의 — CLAUDE.md §6 "connection_type = MEME 이거나 meme_score ≥ 70". */
export function isMemeConnection(type: ConnectionKind, memeScore: number): boolean {
  return type === 'MEME' || memeScore >= 70;
}

export type ChipTone = 'green' | 'blue' | 'gray';

/** docs/05-screen-specs.md S1 — 관련기업 칩 색 규칙. */
export function companyChipTone(input: {
  type: ConnectionKind;
  businessRelevance: number;
  memeScore: number;
}): ChipTone {
  if (isMemeConnection(input.type, input.memeScore)) return 'gray';
  if (input.businessRelevance >= 60) return 'green';
  if (input.businessRelevance >= 30) return 'blue';
  return 'gray';
}
