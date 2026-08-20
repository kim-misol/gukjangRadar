/**
 * T1.2.2 — DART 기업개황으로부터 business_summary(1~2문장)를 만든다.
 * 순수 함수, 결정론적 템플릿 (R1: LLM이 만들지 않는다, R7: IO 없음).
 * 없는 필드는 조용히 생략한다 — 데이터에 없는 것을 지어내지 않는다.
 */
import type { DartCompanyOverviewResponse } from './types';

export interface BusinessSummaryInput {
  /** company.name (정식 사명) */
  name: string;
  /** company.market ('KOSPI'|'KOSDAQ'|'KONEX') */
  market: string;
  /** company.sector (KRX 업종 대분류) — DART 기업개황엔 없어 company 테이블 값을 그대로 쓴다. */
  sector?: string;
  overview?: Pick<DartCompanyOverviewResponse, 'ceo_nm' | 'est_dt'>;
}

function parseEstYear(estDt: string | undefined): string | null {
  if (!estDt || !/^\d{8}$/.test(estDt)) return null;
  return estDt.slice(0, 4);
}

export function buildBusinessSummary(input: BusinessSummaryInput): string {
  const sentences: string[] = [];

  const estYear = parseEstYear(input.overview?.est_dt);
  const sectorClause = input.sector ? `${input.sector} 업종의 ` : '';
  const firstSentence = estYear
    ? `${input.name}은(는) ${sectorClause}${input.market} 상장기업으로, ${estYear}년에 설립되었다.`
    : `${input.name}은(는) ${sectorClause}${input.market} 상장기업이다.`;
  sentences.push(firstSentence);

  const ceoNm = input.overview?.ceo_nm;
  if (ceoNm) {
    sentences.push(`대표이사는 ${ceoNm}이다.`);
  }

  return sentences.join(' ');
}
