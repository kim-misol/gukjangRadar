/**
 * T1.3.1 — KIS Open API(국내주식 현재가 시세 조회) 응답 타입.
 * 이 샌드박스는 KIS_APP_KEY/SECRET이 없고 외부망도 W1/W2 기록처럼 막혀 있을 가능성이 높아
 * 아래 필드명을 실제 응답으로 검증하지 못했다 — 공개 문서(국내주식 현재가 시세, tr_id
 * FHKST01010100)의 output 필드를 그대로 따랐다. 실 API 키/네트워크가 있는 환경에서
 * 재검증할 것(apps/worker/src/collectors/dart-client.ts와 같은 처지).
 */
export interface KisTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface KisPriceResponse {
  rt_cd: string; // '0' = 정상
  msg_cd: string;
  msg1: string;
  output: {
    stck_prpr: string; // 주식 현재가
    prdy_vrss: string; // 전일 대비
    prdy_vrss_sign: string; // 1 상한 2 상승 3 보합 4 하한 5 하락
    prdy_ctrt: string; // 전일 대비율(%)
    acml_vol: string; // 누적 거래량
    acml_tr_pbmn: string; // 누적 거래대금
  };
}
