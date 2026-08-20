import { describe, expect, it } from 'vitest';
import { buildBusinessSummary } from './business-summary';

describe('buildBusinessSummary', () => {
  it('업종·시장·설립년도·대표이사가 모두 있으면 2문장을 만든다', () => {
    const result = buildBusinessSummary({
      name: '노루페인트',
      market: 'KOSPI',
      sector: '화학',
      overview: { est_dt: '19450101', ceo_nm: '홍길동' },
    });
    expect(result).toBe(
      '노루페인트은(는) 화학 업종의 KOSPI 상장기업으로, 1945년에 설립되었다. 대표이사는 홍길동이다.',
    );
  });

  it('설립년도가 없으면 첫 문장만 간단한 형태로 만든다', () => {
    const result = buildBusinessSummary({ name: 'NAVER', market: 'KOSPI', sector: '서비스업' });
    expect(result).toBe('NAVER은(는) 서비스업 업종의 KOSPI 상장기업이다.');
  });

  it('sector가 없으면 업종 절을 생략한다', () => {
    const result = buildBusinessSummary({ name: '테스트기업', market: 'KOSDAQ' });
    expect(result).toBe('테스트기업은(는) KOSDAQ 상장기업이다.');
  });

  it('est_dt 형식이 이상하면(8자리 아님) 설립년도 절을 생략한다', () => {
    const result = buildBusinessSummary({
      name: '테스트기업',
      market: 'KOSPI',
      overview: { est_dt: 'unknown' },
    });
    expect(result).toBe('테스트기업은(는) KOSPI 상장기업이다.');
  });

  it('ceo_nm이 없으면 두 번째 문장을 만들지 않는다', () => {
    const result = buildBusinessSummary({
      name: '테스트기업',
      market: 'KOSPI',
      overview: { est_dt: '20000101' },
    });
    expect(result).toBe('테스트기업은(는) KOSPI 상장기업으로, 2000년에 설립되었다.');
  });
});
