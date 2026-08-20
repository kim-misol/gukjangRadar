/**
 * T1.1.1 — KRX 원본 행 → company 테이블 upsert 입력. 순수 함수 (R7).
 */
import { normalizeName, toJamo } from '../normalize/hangul';
import type { CompanyUpsertInput, KrxListingRow } from './types';

const MARKET_NAME_MAP: Record<string, CompanyUpsertInput['market']> = {
  KOSPI: 'KOSPI',
  유가증권: 'KOSPI',
  KOSDAQ: 'KOSDAQ',
  코스닥: 'KOSDAQ',
  KONEX: 'KONEX',
  코넥스: 'KONEX',
};

function parseMarket(mktNm: string): CompanyUpsertInput['market'] | null {
  return MARKET_NAME_MAP[mktNm.trim()] ?? null;
}

function parseListDate(listDd: string | undefined): string | null {
  if (!listDd || listDd.length !== 8) return null;
  const y = listDd.slice(0, 4);
  const m = listDd.slice(4, 6);
  const d = listDd.slice(6, 8);
  return `${y}-${m}-${d}`;
}

/**
 * KRX 원본 행 하나를 company upsert 입력으로 변환한다.
 * 시장구분을 알 수 없거나 종목코드가 6자리가 아니면 null(스킵)을 반환한다 —
 * 잘못된 행을 억지로 적재하지 않는다 (R1과 같은 원칙: 모르면 만들지 않는다).
 */
export function toCompanyUpsertInput(row: KrxListingRow): CompanyUpsertInput | null {
  const ticker = row.ISU_SRT_CD?.trim();
  if (!ticker || !/^\d{6}$/.test(ticker)) return null;

  const market = parseMarket(row.MKT_NM ?? '');
  if (!market) return null;

  const name = (row.ISU_NM || row.ISU_ABBRV || '').trim();
  if (!name) return null;

  const nameNorm = normalizeName(name);
  return {
    ticker,
    isin: row.ISU_CD?.trim() || null,
    name,
    nameNorm,
    nameJamo: toJamo(nameNorm),
    market,
    sector: row.IDX_IND_NM?.trim() || null,
    listedAt: parseListDate(row.LIST_DD),
  };
}
