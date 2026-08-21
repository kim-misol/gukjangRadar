import { describe, expect, it, vi } from 'vitest';
import { KisClient } from './kis-client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

const tokenBody = { access_token: 'test-token', token_type: 'Bearer', expires_in: 86400 };
const priceBody = {
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
  },
};

describe('KisClient', () => {
  it('appKey/appSecret이 비어 있으면 생성 시점에 던진다', () => {
    expect(() => new KisClient({ appKey: '', appSecret: 's' })).toThrow(/appKey/);
  });

  it('토큰을 먼저 받고 그 다음 현재가를 조회한다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody))
      .mockResolvedValueOnce(jsonResponse(priceBody));
    const client = new KisClient({
      appKey: 'k',
      appSecret: 's',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const price = await client.fetchPrice('005930');

    expect(price.output.stck_prpr).toBe('68000');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const tokenUrl = (fetchImpl.mock.calls[0] as unknown[])[0] as string;
    expect(tokenUrl).toContain('/oauth2/tokenP');
    const priceUrl = (fetchImpl.mock.calls[1] as unknown[])[0] as string;
    expect(priceUrl).toContain('FID_INPUT_ISCD=005930');
    const priceInit = (fetchImpl.mock.calls[1] as unknown[])[1] as RequestInit;
    expect((priceInit.headers as Record<string, string>).authorization).toBe('Bearer test-token');
  });

  it('토큰이 만료 전이면 재사용하고 새로 받지 않는다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody))
      .mockResolvedValueOnce(jsonResponse(priceBody))
      .mockResolvedValueOnce(jsonResponse(priceBody));
    const client = new KisClient({
      appKey: 'k',
      appSecret: 's',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.fetchPrice('005930');
    await client.fetchPrice('000660');

    // 토큰 발급은 1회만 — 시세 조회 2회 + 토큰 1회 = 총 3회
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('HTTP 오류 시 재시도 후 실패하면 던진다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const client = new KisClient({
      appKey: 'k',
      appSecret: 's',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 1,
      retryDelayMs: 1,
    });
    await expect(client.fetchPrice('005930')).rejects.toThrow(/KIS API 조회 실패/);
  });
});
