import type { PathStep } from '@gukjang/spec';
import { describe, expect, it } from 'vitest';
import { buildPathPreview } from './path-preview';

describe('buildPathPreview', () => {
  it('경로 스텝의 label을 화살표로 잇는다 (docs/05 S3 예시)', () => {
    const path: PathStep[] = [
      { nodeId: 1, kind: 'ENTITY', label: '태풍 노루' },
      { nodeId: 2, kind: 'ENTITY', label: '노루', edgeType: 'MENTIONS', edgeLabel: '언급' },
      {
        nodeId: 3,
        kind: 'COMPANY',
        label: '노루페인트',
        edgeType: 'NAME_MATCH',
        edgeLabel: '이름 일치',
      },
    ];
    expect(buildPathPreview(path)).toBe('태풍 노루 → 노루 → 노루페인트');
  });

  it('빈 경로는 빈 문자열을 반환한다', () => {
    expect(buildPathPreview([])).toBe('');
  });
});
