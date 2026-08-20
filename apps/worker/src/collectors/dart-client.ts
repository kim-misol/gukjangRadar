/**
 * T1.2.1 — OpenDART(opendart.fss.or.kr) 클라이언트.
 *
 * 이 샌드박스는 opendart.fss.or.kr에 대한 접근이 막혀 있어(네트워크 차단 —
 * W1/W2 진행 기록 참조) 아래 엔드포인트/필드명을 **실제 응답으로 검증하지
 * 못했다**. 공개된 OpenDART 개발가이드의 기업개황/최대주주 현황 API를 그대로
 * 따랐지만, 실 API 키와 네트워크가 있는 환경에서 한 번 실행해 재검증할 것 —
 * 그 전까지는 라이브 신뢰도 낮음으로 표시한다.
 *
 * 인증: crtfc_key(발급받은 API 키) 쿼리 파라미터. 레이트리밋은 공개적으로
 * 알려진 "일 20,000회" 기준으로 재시도 백오프를 잡았다(역시 미검증).
 */
import type { DartCompanyOverviewResponse, DartMajorShareholderResponse } from '@gukjang/core';

const DART_BASE_URL = 'https://opendart.fss.or.kr/api';

/** 정상 처리. */
const STATUS_OK = '000';
/** 조회된 데이터가 없음 — 오류가 아니라 "이 회사는 이 데이터가 없다"는 정상 응답. */
const STATUS_NO_DATA = '013';

export interface DartClientOptions {
  apiKey: string;
  /** 테스트/모킹용 주입 지점. 기본값은 전역 fetch. */
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryDelayMs?: number;
}

export class DartClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: DartClientOptions) {
    if (!options.apiKey) throw new Error('DartClient: apiKey가 비어 있음 (DART_API_KEY 확인)');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  /** 기업개황 (company.json) — T1.2.2 business_summary의 입력. */
  async fetchCompanyOverview(corpCode: string): Promise<DartCompanyOverviewResponse> {
    const json = await this.getJson<DartCompanyOverviewResponse>('/company.json', {
      corp_code: corpCode,
    });
    if (json.status !== STATUS_OK && json.status !== STATUS_NO_DATA) {
      throw new Error(`DART 기업개황 조회 실패 (status=${json.status}): ${json.message}`);
    }
    return json;
  }

  /**
   * 최대주주 현황 (hyslrSttus.json) — T1.2.3 AFFILIATION 엣지의 입력.
   * status=013(데이터 없음)이면 빈 배열을 반환한다 (오류 아님).
   */
  async fetchMajorShareholders(
    corpCode: string,
    bsnsYear: string,
    reprtCode = '11011', // 사업보고서
  ): Promise<DartMajorShareholderResponse['list']> {
    const json = await this.getJson<DartMajorShareholderResponse>('/hyslrSttus.json', {
      corp_code: corpCode,
      bsns_year: bsnsYear,
      reprt_code: reprtCode,
    });
    if (json.status === STATUS_NO_DATA) return [];
    if (json.status !== STATUS_OK) {
      throw new Error(`DART 최대주주 현황 조회 실패 (status=${json.status}): ${json.message}`);
    }
    return json.list ?? [];
  }

  private async getJson<T>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams({ crtfc_key: this.apiKey, ...params });
    const url = `${DART_BASE_URL}${path}?${query.toString()}`;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(url);
        if (!res.ok) {
          throw new Error(`DART 응답 실패: HTTP ${res.status}`);
        }
        return (await res.json()) as T;
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await sleep(this.retryDelayMs);
        }
      }
    }
    throw new Error(`DART API 조회 실패 (재시도 ${this.maxRetries}회 소진): ${String(lastError)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
