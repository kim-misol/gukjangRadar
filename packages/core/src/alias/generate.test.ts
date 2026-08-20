import { describe, expect, it } from 'vitest';
import { generateAliasCandidates } from './generate';

describe('generateAliasCandidates', () => {
  it('노루홀딩스는 OFFICIAL/TICKER/SHORT("노루") 별칭을 만들고 SHORT는 모호로 표시된다', () => {
    const aliases = generateAliasCandidates({
      name: '노루홀딩스',
      ticker: '000320',
      isHolding: true,
    });

    const official = aliases.find((a) => a.aliasType === 'OFFICIAL');
    expect(official?.alias).toBe('노루홀딩스');

    const short = aliases.find((a) => a.aliasType === 'SHORT');
    expect(short?.alias).toBe('노루');
    expect(short?.isAmbiguous).toBe(true); // '노루'는 일반명사와 겹침 (docs/12 §A1)

    const ticker = aliases.find((a) => a.aliasType === 'TICKER');
    expect(ticker?.alias).toBe('000320');
  });

  it('구 사명(FORMER)을 별칭으로 만든다 — A6: 하이닉스반도체 → SK하이닉스', () => {
    const aliases = generateAliasCandidates({
      name: 'SK하이닉스',
      ticker: '000660',
      formerNames: ['하이닉스반도체'],
    });
    const former = aliases.find((a) => a.aliasType === 'FORMER');
    expect(former?.alias).toBe('하이닉스반도체');
    expect(former?.isAmbiguous).toBe(false);
  });

  it('영문 2자 이하 약어는 별칭 후보에서 제외한다 (A5)', () => {
    const aliases = generateAliasCandidates({
      name: 'LG화학',
      ticker: '051910',
      englishName: 'LG', // 실제로는 이런 짧은 영문명을 안 넣겠지만 가드를 검증
    });
    expect(aliases.some((a) => a.alias === 'LG')).toBe(false);
  });

  it('같은 (type, normalizedAlias) 조합은 중복 생성하지 않는다', () => {
    const aliases = generateAliasCandidates({
      name: '노루페인트',
      ticker: '090350',
      formerNames: ['노루페인트'], // 정식명과 우연히 같은 값
    });
    const officialAndFormer = aliases.filter((a) => a.aliasNorm === '노루페인트');
    // OFFICIAL 1건만 — FORMER는 같은 (aliasNorm) 이지만 type이 달라 별개로 남는다
    expect(officialAndFormer.map((a) => a.aliasType).sort()).toEqual(['FORMER', 'OFFICIAL']);
  });

  it('지주회사가 아니면 SHORT 별칭을 만들지 않는다', () => {
    const aliases = generateAliasCandidates({ name: 'SK하이닉스', ticker: '000660' });
    expect(aliases.some((a) => a.aliasType === 'SHORT')).toBe(false);
  });
});
