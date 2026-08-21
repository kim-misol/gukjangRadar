import { describe, expect, it } from 'vitest';
import { mapKisPriceResponse } from './map-snapshot';
import type { KisPriceResponse } from './types';

function makeResponse(overrides: Partial<KisPriceResponse['output']> = {}): KisPriceResponse {
  return {
    rt_cd: '0',
    msg_cd: 'MCA00000',
    msg1: '정상처리',
    output: {
      stck_prpr: '68000',
      prdy_vrss: '1000',
      prdy_vrss_sign: '2',
      prdy_ctrt: '1.49',
      acml_vol: '12345678',
      acml_tr_pbmn: '839999999',
      ...overrides,
    },
  };
}

describe('mapKisPriceResponse', () => {
  it('문자열 필드를 숫자로 바꾼다', () => {
    const result = mapKisPriceResponse(makeResponse());
    expect(result.price).toBe(68000);
    expect(result.volume).toBe(12345678);
    expect(result.valueTraded).toBe(839999999);
  });

  it('상승(2)이면 등락률이 양수다', () => {
    const result = mapKisPriceResponse(makeResponse({ prdy_vrss_sign: '2', prdy_ctrt: '1.49' }));
    expect(result.changePct).toBe(1.49);
  });

  it('하락(5)이면 등락률이 음수다', () => {
    const result = mapKisPriceResponse(makeResponse({ prdy_vrss_sign: '5', prdy_ctrt: '2.1' }));
    expect(result.changePct).toBe(-2.1);
  });

  it('하한(4)도 음수로 취급한다', () => {
    const result = mapKisPriceResponse(makeResponse({ prdy_vrss_sign: '4', prdy_ctrt: '30.0' }));
    expect(result.changePct).toBe(-30);
  });
});
