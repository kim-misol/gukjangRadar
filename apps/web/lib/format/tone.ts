import type { ConnectionKind } from '@gukjang/spec';
import { isMemeConnection } from '@gukjang/core';

export { isMemeConnection };

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
