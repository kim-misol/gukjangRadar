import { describe, expect, it } from 'vitest';
import { toJamo, toJamoUnits, normalizeName } from './hangul';

describe('toJamo / toJamoUnits', () => {
  // docs/09-prompt-company-matching.md §2 예시 그대로 검증
  it('원희 → ㅇㅜㅓㄴㅎㅢ (6유닛, ㅝ는 ㅜㅓ로 분해되고 ㅢ는 그대로)', () => {
    expect(toJamoUnits('원희')).toEqual(['ㅇ', 'ㅜ', 'ㅓ', 'ㄴ', 'ㅎ', 'ㅢ']);
    expect(toJamo('원희')).toBe('ㅇㅜㅓㄴㅎㅢ');
  });

  it('원익 → ㅇㅜㅓㄴㅇㅣㄱ (7유닛)', () => {
    expect(toJamoUnits('원익')).toEqual(['ㅇ', 'ㅜ', 'ㅓ', 'ㄴ', 'ㅇ', 'ㅣ', 'ㄱ']);
    expect(toJamo('원익')).toBe('ㅇㅜㅓㄴㅇㅣㄱ');
  });

  it('겹받침을 두 자음으로 분해한다', () => {
    // 값 = ㄱㅏㅄ → ㄱ, ㅏ, ㅂ, ㅅ
    expect(toJamoUnits('값')).toEqual(['ㄱ', 'ㅏ', 'ㅂ', 'ㅅ']);
  });

  it('종성이 없는 음절은 초성+중성만 나온다', () => {
    expect(toJamoUnits('노')).toEqual(['ㄴ', 'ㅗ']);
  });

  it('한글이 아닌 문자는 그대로 통과한다', () => {
    expect(toJamoUnits('SK하이닉스')).toEqual([
      'S',
      'K',
      'ㅎ',
      'ㅏ',
      'ㅇ',
      'ㅣ',
      'ㄴ',
      'ㅣ',
      'ㄱ',
      'ㅅ',
      'ㅡ',
    ]);
  });
});

describe('normalizeName', () => {
  it('공백과 법인 표기를 제거한다', () => {
    expect(normalizeName('(주) 노루페인트')).toBe('노루페인트');
    expect(normalizeName('삼성 전자')).toBe('삼성전자');
  });

  it('대소문자를 통일한다', () => {
    expect(normalizeName('NAVER')).toBe('naver');
  });
});
