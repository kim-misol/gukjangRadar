/**
 * T1.1.1 — KRX(한국거래소) 상장회사 목록 원본 행 타입.
 *
 * 주의: 이 필드 셋은 data.krx.co.kr의 "전종목 기본정보"(MDCSTAT01901류) 응답을
 * 참고해 구성한 최선의 추정치다 — 이 샌드박스는 data.krx.co.kr 접근이 막혀 있어
 * (403, W1/W2 진행 기록 참조) **실제 응답으로 검증하지 못했다**. 실 네트워크가 열린
 * 환경에서 `KrxListingClient.fetchAll()`을 한 번 돌려 실제 필드명과 대조할 것.
 */
export interface KrxListingRow {
  /** 종목코드 (6자리, 예: "005930") */
  ISU_SRT_CD: string;
  /** 종목명 (정식) */
  ISU_NM: string;
  /** 종목약명 */
  ISU_ABBRV: string;
  /** 시장구분명 — "KOSPI" | "KOSDAQ" | "KONEX" */
  MKT_NM: string;
  /** 상장일 (YYYYMMDD) */
  LIST_DD: string;
  /** ISIN */
  ISU_CD?: string;
  /** 업종명 */
  IDX_IND_NM?: string;
}

/** packages/core에서 다루는, DB 스키마에 가까운 형태로 정규화한 결과. */
export interface CompanyUpsertInput {
  ticker: string;
  isin: string | null;
  name: string;
  nameNorm: string;
  nameJamo: string;
  market: 'KOSPI' | 'KOSDAQ' | 'KONEX';
  sector: string | null;
  listedAt: string | null; // YYYY-MM-DD
}
