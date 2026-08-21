import { describe, expect, it } from 'vitest';
import {
  stripBracketPrefixes,
  stripOutletSuffix,
  unifyQuotes,
  fullwidthToHalfwidth,
  normalizeTitleForDisplay,
  tokenizeForClustering,
} from './title-normalize';

describe('stripBracketPrefixes', () => {
  it('[속보]를 벗긴다', () => {
    expect(stripBracketPrefixes('[속보] 삼성전자 실적 발표')).toBe('삼성전자 실적 발표');
  });

  it('[단독][속보]처럼 연속된 태그를 모두 벗긴다', () => {
    expect(stripBracketPrefixes('[단독][속보] 노루페인트 신제품 출시')).toBe(
      '노루페인트 신제품 출시',
    );
  });

  it('본문 중간의 대괄호는 건드리지 않는다', () => {
    expect(stripBracketPrefixes('삼성전자 [단독] 신제품')).toBe('삼성전자 [단독] 신제품');
  });
});

describe('stripOutletSuffix', () => {
  it('매체명 접미를 벗긴다', () => {
    expect(stripOutletSuffix('삼성전자 실적 발표 - 한국경제', '한국경제')).toBe(
      '삼성전자 실적 발표',
    );
  });

  it('sourceName이 없으면 그대로 둔다', () => {
    expect(stripOutletSuffix('삼성전자 실적 발표 - 한국경제')).toBe(
      '삼성전자 실적 발표 - 한국경제',
    );
  });

  it('구분자가 |여도 벗긴다', () => {
    expect(stripOutletSuffix('삼성전자 실적 발표 | 한국경제', '한국경제')).toBe(
      '삼성전자 실적 발표',
    );
  });
});

describe('unifyQuotes', () => {
  it('곡선 따옴표를 직선으로 통일한다', () => {
    expect(unifyQuotes('“노루” 화제 ‘급등’')).toBe('"노루" 화제 \'급등\'');
  });
});

describe('fullwidthToHalfwidth', () => {
  it('전각 영숫자를 반각으로 바꾼다', () => {
    expect(fullwidthToHalfwidth('ＡＢＣ１２３')).toBe('ABC123');
  });

  it('전각 공백을 일반 공백으로 바꾼다', () => {
    expect(fullwidthToHalfwidth('삼성전자　실적')).toBe('삼성전자 실적');
  });
});

describe('normalizeTitleForDisplay', () => {
  it('접두·접미·따옴표·전각을 한 번에 정리한다', () => {
    const raw = '[속보] “노루” 화제…ＡＢＣ - 한국경제';
    expect(normalizeTitleForDisplay(raw, '한국경제')).toBe('"노루" 화제…ABC');
  });

  it('여러 공백을 하나로 접는다', () => {
    expect(normalizeTitleForDisplay('삼성전자   실적    발표')).toBe('삼성전자 실적 발표');
  });
});

describe('tokenizeForClustering', () => {
  it('공백/기호를 제거하고 문자 2-gram을 만든다', () => {
    expect(tokenizeForClustering('노루 화제')).toEqual(['노루', '루화', '화제']);
  });

  it('한 글자면 그 글자 하나를 토큰으로 반환한다', () => {
    expect(tokenizeForClustering('노')).toEqual(['노']);
  });

  it('빈 문자열이면 빈 배열', () => {
    expect(tokenizeForClustering('')).toEqual([]);
  });

  it('조사가 달라도 상당 부분의 2-gram이 겹친다', () => {
    const a = tokenizeForClustering('노루페인트 실적 발표');
    const b = tokenizeForClustering('노루페인트가 실적을 발표했다');
    const overlap = a.filter((t) => b.includes(t));
    expect(overlap.length).toBeGreaterThan(a.length * 0.5);
  });
});
