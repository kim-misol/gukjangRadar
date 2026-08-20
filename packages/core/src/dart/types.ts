/**
 * T1.2.1/T1.2.2/T1.2.3 — OpenDART(opendart.fss.or.kr) 응답 타입.
 *
 * 이 샌드박스는 opendart.fss.or.kr에 대한 접근이 막혀 있어 아래 필드명을
 * **실제 응답으로 검증하지 못했다** (KRX와 동일한 사유 — W1/W2 진행 기록 참조).
 * 공개 문서(OpenDART 개발가이드)에 따른 필드명을 그대로 따랐으나, 실 네트워크가
 * 열린 환경에서 `DartClient`를 한 번 실행해 재검증할 것 — 그 전까지는 라이브
 * 신뢰도 낮음으로 표시한다.
 */

/** 모든 OpenDART 응답이 공통으로 갖는 상태 봉투. status='000'이면 정상. */
export interface DartApiEnvelope {
  status: string;
  message: string;
}

/** 기업개황(company.json) 응답 — T1.2.2 business_summary의 입력. */
export interface DartCompanyOverviewResponse extends DartApiEnvelope {
  corp_name?: string;
  corp_name_eng?: string;
  stock_name?: string;
  stock_code?: string;
  ceo_nm?: string;
  corp_cls?: string;
  jurir_no?: string;
  bizr_no?: string;
  adres?: string;
  hm_url?: string;
  induty_code?: string;
  est_dt?: string; // YYYYMMDD
  acc_mt?: string;
}

/** 최대주주 현황(hyslrSttus.json) 응답의 행 하나 — T1.2.3 AFFILIATION 엣지의 입력. */
export interface DartMajorShareholderRow {
  rcept_no?: string;
  corp_cls?: string;
  nm: string; // 주주명 (회사 또는 개인)
  relate?: string; // 관계 (본인/특수관계인 등)
  stock_knd?: string;
  bsis_posesn_stock_co?: string; // 기초 소유주식수
  bsis_posesn_stock_qota_rt?: string; // 기초 지분율(%, 문자열)
  trmend_posesn_stock_co?: string; // 기말 소유주식수
  trmend_posesn_stock_qota_rt?: string; // 기말 지분율(%, 문자열)
  rm?: string;
}

export interface DartMajorShareholderResponse extends DartApiEnvelope {
  list?: DartMajorShareholderRow[];
}
