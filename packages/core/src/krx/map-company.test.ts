import { describe, expect, it } from 'vitest';
import { toCompanyUpsertInput } from './map-company';
import type { KrxListingRow } from './types';

const baseRow: KrxListingRow = {
  ISU_SRT_CD: '005930',
  ISU_NM: '삼성전자',
  ISU_ABBRV: '삼성전자',
  MKT_NM: 'KOSPI',
  LIST_DD: '19750611',
  ISU_CD: 'KR7005930003',
  IDX_IND_NM: '전기전자',
};

describe('toCompanyUpsertInput', () => {
  it('정상 행을 CompanyUpsertInput으로 변환한다', () => {
    const result = toCompanyUpsertInput(baseRow);
    expect(result).toEqual({
      ticker: '005930',
      isin: 'KR7005930003',
      name: '삼성전자',
      nameNorm: '삼성전자',
      nameJamo: expect.any(String),
      market: 'KOSPI',
      sector: '전기전자',
      listedAt: '1975-06-11',
    });
  });

  it('한글 시장구분명("코스닥")도 인식한다', () => {
    const result = toCompanyUpsertInput({ ...baseRow, MKT_NM: '코스닥' });
    expect(result?.market).toBe('KOSDAQ');
  });

  it('종목코드가 6자리가 아니면 null', () => {
    expect(toCompanyUpsertInput({ ...baseRow, ISU_SRT_CD: '123' })).toBeNull();
  });

  it('시장구분을 모르면 null (지어내지 않는다)', () => {
    expect(toCompanyUpsertInput({ ...baseRow, MKT_NM: '알수없음' })).toBeNull();
  });

  it('정식명이 없으면 약명을 대신 쓴다', () => {
    const result = toCompanyUpsertInput({ ...baseRow, ISU_NM: '' });
    expect(result?.name).toBe('삼성전자');
  });
});
