/**
 * T1.1.1 — KRX(data.krx.co.kr) 상장회사 목록 수집기.
 *
 * 이 샌드박스는 data.krx.co.kr에 대한 접근이 막혀 있어(403 — W2 진행 기록 참조)
 * 아래 엔드포인트/파라미터를 **실제 응답으로 검증하지 못했다**. 공개적으로 잘 알려진
 * KRX 정보데이터시스템(data.krx.co.kr)의 "getJsonData.cmd" 그리드 조회 방식을 그대로
 * 따랐지만, 실 네트워크가 열린 환경에서 `fetchAll()`을 한 번 실행해 실제 필드명·
 * bld 코드가 맞는지 재검증할 것 — 그 전까지는 라이브 신뢰도 낮음으로 표시한다.
 */
import type { KrxListingRow } from '@gukjang/core';

const KRX_JSON_ENDPOINT = 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
/** 전종목 기본정보 그리드의 bld 코드 (data.krx.co.kr "전체" 상장회사 검색 화면 기준 추정) */
const KRX_LISTING_BLD = 'dbms/MDC/STAT/standard/MDCSTAT01901';

export interface KrxClientOptions {
  /** 테스트/모킹용 주입 지점. 기본값은 전역 fetch. */
  fetchImpl?: typeof fetch;
  /** 요청 실패 시 재시도 횟수 */
  maxRetries?: number;
  /** 재시도 간 대기(ms) */
  retryDelayMs?: number;
}

export class KrxListingClient {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: KrxClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  /** 전 종목(KOSPI+KOSDAQ+KONEX) 기본정보를 가져온다. */
  async fetchAll(): Promise<KrxListingRow[]> {
    const body = new URLSearchParams({
      bld: KRX_LISTING_BLD,
      mktId: 'ALL',
      trdDd: '',
      share: '1',
      csvxls_isNo: 'false',
    });

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(KRX_JSON_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: 'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd',
          },
          body: body.toString(),
        });

        if (!res.ok) {
          throw new Error(`KRX 응답 실패: HTTP ${res.status}`);
        }

        const json = (await res.json()) as { OutBlock_1?: KrxListingRow[] };
        const rows = json.OutBlock_1;
        if (!Array.isArray(rows)) {
          throw new Error('KRX 응답에 OutBlock_1 배열이 없음 — 응답 형식이 예상과 다름');
        }
        return rows;
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await sleep(this.retryDelayMs);
        }
      }
    }
    throw new Error(
      `KRX 상장회사 목록 조회 실패 (재시도 ${this.maxRetries}회 소진): ${String(lastError)}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
