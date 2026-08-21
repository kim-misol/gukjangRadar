/**
 * T1.3.1 — 한국투자증권(KIS) Open API 클라이언트 (국내주식 현재가 시세 조회).
 *
 * 이 샌드박스엔 KIS_APP_KEY/SECRET이 없고(.env 확인) 외부망도 W1/W2 기록처럼 막혀 있을
 * 가능성이 높아 아래 엔드포인트/필드명을 **실제 응답으로 검증하지 못했다** — 공개된 KIS
 * Open API 개발가이드(국내주식 현재가 시세, tr_id FHKST01010100)를 그대로 따랐지만, 실 API
 * 키와 네트워크가 있는 환경에서 한 번 실행해 재검증할 것(apps/worker/src/collectors/
 * dart-client.ts와 같은 처지 — docs/15 W7 기록 참고).
 *
 * 인증: OAuth2 client_credentials, 토큰 유효기간 ~24시간이라 만료 전까지 재사용한다
 * (매 호출마다 새로 받으면 KIS 쪽 발급 레이트리밋에 걸린다).
 */
import type { KisPriceResponse, KisTokenResponse } from '@gukjang/core';

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';
const PRICE_TR_ID = 'FHKST01010100';

export interface KisClientOptions {
  appKey: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class KisClient {
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  private cachedToken: { value: string; expiresAt: number } | undefined;

  constructor(options: KisClientOptions) {
    if (!options.appKey || !options.appSecret) {
      throw new Error('KisClient: appKey/appSecret이 비어 있음 (KIS_APP_KEY/KIS_APP_SECRET 확인)');
    }
    this.appKey = options.appKey;
    this.appSecret = options.appSecret;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  /** 국내주식 현재가 시세 조회. ticker는 6자리 종목코드. */
  async fetchPrice(ticker: string): Promise<KisPriceResponse> {
    const token = await this.getAccessToken();
    return this.request<KisPriceResponse>(
      `/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${ticker}`,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          appkey: this.appKey,
          appsecret: this.appSecret,
          tr_id: PRICE_TR_ID,
          custtype: 'P',
        },
      },
    );
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return this.cachedToken.value;
    }

    const json = await this.request<KisTokenResponse>('/oauth2/tokenP', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: this.appKey,
        appsecret: this.appSecret,
      }),
    });

    // 만료 5분 전에 미리 갱신 — 배치 도중 만료돼 요청이 실패하는 것을 피한다.
    const expiresAt = now + (json.expires_in - 300) * 1000;
    this.cachedToken = { value: json.access_token, expiresAt };
    return json.access_token;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${KIS_BASE_URL}${path}`;
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(url, init);
        if (!res.ok) {
          throw new Error(`KIS 응답 실패: HTTP ${res.status}`);
        }
        return (await res.json()) as T;
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await sleep(this.retryDelayMs);
        }
      }
    }
    throw new Error(`KIS API 조회 실패 (재시도 ${this.maxRetries}회 소진): ${String(lastError)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
