import { describe, expect, it, vi } from 'vitest';
import { DartClient } from './dart-client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('DartClient', () => {
  it('apiKey가 비어 있으면 생성 시점에 던진다', () => {
    expect(() => new DartClient({ apiKey: '' })).toThrow(/apiKey/);
  });

  it('기업개황을 정상 파싱한다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ status: '000', message: '정상', corp_name: '노루페인트', ceo_nm: '홍길동' }),
      );
    const client = new DartClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const overview = await client.fetchCompanyOverview('00126380');
    expect(overview.corp_name).toBe('노루페인트');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calledUrl = (fetchImpl.mock.calls[0] as unknown[])[0] as string;
    expect(calledUrl).toContain('crtfc_key=test-key');
    expect(calledUrl).toContain('corp_code=00126380');
  });

  it('기업개황 status가 013(데이터 없음)이면 그대로 반환한다 (오류 아님)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: '013', message: '데이터 없음' }));
    const client = new DartClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const overview = await client.fetchCompanyOverview('00000000');
    expect(overview.status).toBe('013');
  });

  it('기업개황 status가 그 외 오류코드면 던진다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: '020', message: '요청 제한 초과' }));
    const client = new DartClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 0,
    });
    await expect(client.fetchCompanyOverview('00126380')).rejects.toThrow(/status=020/);
  });

  it('최대주주 현황 status=013이면 빈 배열을 반환한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: '013', message: '없음' }));
    const client = new DartClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const list = await client.fetchMajorShareholders('00126380', '2025');
    expect(list).toEqual([]);
  });

  it('최대주주 현황 목록을 정상 파싱한다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        status: '000',
        message: '정상',
        list: [{ nm: '노루홀딩스', relate: '본인', trmend_posesn_stock_qota_rt: '45.31' }],
      }),
    );
    const client = new DartClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const list = await client.fetchMajorShareholders('00126380', '2025');
    expect(list).toHaveLength(1);
    expect(list?.[0]?.nm).toBe('노루홀딩스');
  });

  it('HTTP 오류 시 재시도 후 실패하면 던진다', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const client = new DartClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 2,
      retryDelayMs: 1,
    });
    await expect(client.fetchCompanyOverview('00126380')).rejects.toThrow(/DART API 조회 실패/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
