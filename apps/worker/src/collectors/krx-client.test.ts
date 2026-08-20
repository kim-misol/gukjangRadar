import { describe, expect, it, vi } from 'vitest';
import { KrxListingClient } from './krx-client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('KrxListingClient', () => {
  it('OutBlock_1 배열을 반환한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        OutBlock_1: [{ ISU_SRT_CD: '005930', ISU_NM: '삼성전자', MKT_NM: 'KOSPI' }],
      }),
    );
    const client = new KrxListingClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const rows = await client.fetchAll();
    expect(rows).toHaveLength(1);
    // rows.length === 1을 위에서 확인했으므로 rows[0]은 항상 존재한다.
    expect(rows[0]?.ISU_SRT_CD).toBe('005930');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('HTTP 오류 시 재시도 후 실패하면 던진다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const client = new KrxListingClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 2,
      retryDelayMs: 1,
    });
    await expect(client.fetchAll()).rejects.toThrow(/KRX 상장회사 목록 조회 실패/);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 최초 1회 + 재시도 2회
  });

  it('일시 실패 후 재시도로 성공하면 결과를 반환한다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 503))
      .mockResolvedValueOnce(jsonResponse({ OutBlock_1: [{ ISU_SRT_CD: '000660' }] }));
    const client = new KrxListingClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retryDelayMs: 1,
    });
    const rows = await client.fetchAll();
    expect(rows).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('응답에 OutBlock_1이 없으면 에러', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ unexpected: true }));
    const client = new KrxListingClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 0,
    });
    await expect(client.fetchAll()).rejects.toThrow();
  });
});
