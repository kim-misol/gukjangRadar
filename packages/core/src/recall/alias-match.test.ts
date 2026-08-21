import { describe, expect, it } from 'vitest';
import scoringConfig from '@gukjang/spec/scoring.config.json';
import type { AliasRow, RecallConfig } from './types';
import { recallByAlias } from './alias-match';

const cfg = scoringConfig.recall as RecallConfig;

const NORU_PAINT: AliasRow = {
  companyId: 1,
  companyName: '노루페인트',
  companyTicker: '090350',
  alias: '노루',
  aliasNorm: '노루',
  aliasType: 'SHORT',
  isAmbiguous: false,
};
const NORU_HOLDINGS: AliasRow = {
  companyId: 2,
  companyName: '노루홀딩스',
  companyTicker: '000320',
  alias: '노루홀딩스',
  aliasNorm: '노루홀딩스',
  aliasType: 'OFFICIAL',
  isAmbiguous: false,
};
const WONIK_IPS: AliasRow = {
  companyId: 3,
  companyName: '원익IPS',
  companyTicker: '240810',
  alias: '원익IPS',
  aliasNorm: '원익ips',
  aliasType: 'OFFICIAL',
  isAmbiguous: false,
};

describe('recallByAlias', () => {
  // docs/15-build-order.md W2 게이트: "노루" → 노루페인트(ALIAS_EXACT), 노루홀딩스(ALIAS_PREFIX)
  it('"노루" → 노루페인트는 ALIAS_EXACT, 노루홀딩스는 ALIAS_PREFIX', () => {
    const hits = recallByAlias('노루', [NORU_PAINT, NORU_HOLDINGS], cfg);
    const paint = hits.find((h) => h.companyId === 1);
    const holdings = hits.find((h) => h.companyId === 2);
    expect(paint?.recallRule).toBe('ALIAS_EXACT');
    expect(paint?.recallScore).toBe(1.0);
    expect(holdings?.recallRule).toBe('ALIAS_PREFIX');
    // 정렬은 recallScore 내림차순
    expect(hits[0]?.companyId).toBe(1);
  });

  // docs/15 W2 게이트: "원희" → 원익 계열 후보(자모유사도 미달, 첫음절 공유로 ALIAS_PREFIX)
  it('"원희" → 원익IPS는 자모유사도 미달이어도 첫 음절 공유로 후보에 오른다', () => {
    const hits = recallByAlias('원희', [WONIK_IPS], cfg);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.recallRule).toBe('ALIAS_PREFIX');
  });

  it('회사당 최고 점수 후보 하나만 남긴다', () => {
    const dupAlias: AliasRow = { ...NORU_PAINT, alias: '노루페인트', aliasNorm: '노루페인트' };
    const hits = recallByAlias('노루', [NORU_PAINT, dupAlias], cfg);
    expect(hits.filter((h) => h.companyId === 1)).toHaveLength(1);
    expect(hits[0]?.recallRule).toBe('ALIAS_EXACT');
  });

  it('아무 관계 없는 별칭이면 후보가 없다', () => {
    const hits = recallByAlias('완전히 다른 이름', [NORU_PAINT], cfg);
    expect(hits).toHaveLength(0);
  });
});
