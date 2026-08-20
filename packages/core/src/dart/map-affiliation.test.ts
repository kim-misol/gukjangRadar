import { describe, expect, it } from 'vitest';
import { resolveAffiliationCandidates } from './map-affiliation';
import type { DartMajorShareholderRow } from './types';

const KNOWN_COMPANIES = [
  { companyId: 1, nameNorm: '노루페인트' },
  { companyId: 2, nameNorm: '노루홀딩스' },
  { companyId: 3, nameNorm: 'sk하이닉스' },
];

describe('resolveAffiliationCandidates', () => {
  it('docs/06-erd.md §3 예시: 노루페인트의 최대주주 노루홀딩스 → AFFILIATION 후보', () => {
    const shareholders: DartMajorShareholderRow[] = [
      {
        nm: '(주)노루홀딩스',
        relate: '본인',
        trmend_posesn_stock_qota_rt: '45.31',
      },
    ];
    const result = resolveAffiliationCandidates(shareholders, KNOWN_COMPANIES, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      relatedCompanyId: 2,
      relate: '본인',
      stakePercent: 45.31,
      confidence: 0.9,
    });
    expect(result[0]?.weight).toBeGreaterThan(0.3);
    expect(result[0]?.weight).toBeLessThanOrEqual(0.95);
  });

  it('개인 주주(회사 목록에 없는 이름)는 후보에서 제외한다', () => {
    const shareholders: DartMajorShareholderRow[] = [{ nm: '홍길동', relate: '본인' }];
    const result = resolveAffiliationCandidates(shareholders, KNOWN_COMPANIES, 1);
    expect(result).toHaveLength(0);
  });

  it('자기 자신(selfCompanyId)은 후보에서 제외한다', () => {
    const shareholders: DartMajorShareholderRow[] = [{ nm: '노루페인트', relate: '자사주' }];
    const result = resolveAffiliationCandidates(shareholders, KNOWN_COMPANIES, 1);
    expect(result).toHaveLength(0);
  });

  it('같은 회사가 중복 행으로 나오면 한 번만 후보에 넣는다', () => {
    const shareholders: DartMajorShareholderRow[] = [
      { nm: '노루홀딩스', trmend_posesn_stock_qota_rt: '40' },
      { nm: '노루홀딩스', trmend_posesn_stock_qota_rt: '40' },
    ];
    const result = resolveAffiliationCandidates(shareholders, KNOWN_COMPANIES, 1);
    expect(result).toHaveLength(1);
  });

  it('지분율이 없으면 stakePercent는 null, weight는 최소값', () => {
    const shareholders: DartMajorShareholderRow[] = [{ nm: '노루홀딩스' }];
    const result = resolveAffiliationCandidates(shareholders, KNOWN_COMPANIES, 1);
    expect(result[0]?.stakePercent).toBeNull();
    expect(result[0]?.weight).toBeCloseTo(0.3, 2);
  });

  it('지분율 100%에 가까우면 weight는 상한(0.95)에 가깝다', () => {
    const shareholders: DartMajorShareholderRow[] = [
      { nm: 'SK하이닉스', trmend_posesn_stock_qota_rt: '99.9' },
    ];
    const result = resolveAffiliationCandidates(shareholders, KNOWN_COMPANIES, 1);
    expect(result[0]?.weight).toBeCloseTo(0.95, 1);
  });
});
