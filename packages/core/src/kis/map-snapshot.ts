import type { KisPriceResponse } from './types';

export interface MarketSnapshotInput {
  price: number;
  changePct: number;
  volume: number;
  valueTraded: number;
}

/**
 * T1.3.2 — KIS 응답(전부 문자열)을 market_snapshot 삽입용 숫자로 변환한다.
 * prdy_vrss_sign(4=하한,5=하락)이면 등락률을 음수로 바로잡는다 — KIS는 부호를 별도
 * 필드로 주고 prdy_ctrt 자체엔 부호가 없다(공개 문서 기준, 미검증 — kis/types.ts 참고).
 * 순수 함수, IO 없음 (R7).
 */
export function mapKisPriceResponse(res: KisPriceResponse): MarketSnapshotInput {
  const isDown = res.output.prdy_vrss_sign === '4' || res.output.prdy_vrss_sign === '5';
  const rawPct = Math.abs(Number(res.output.prdy_ctrt));

  return {
    price: Number(res.output.stck_prpr),
    changePct: isDown ? -rawPct : rawPct,
    volume: Number(res.output.acml_vol),
    valueTraded: Number(res.output.acml_tr_pbmn),
  };
}
