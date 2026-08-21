/**
 * T2.3.5 — 공시검색(list.json) 응답에서 반증검사 입력으로 쓸 제목만 뽑는다.
 * 순수 함수, IO 없음 (R7).
 */
import type { DartDisclosureListResponse } from './types';

export function extractDisclosureTitles(
  response: DartDisclosureListResponse,
  limit = 10,
): string[] {
  return (response.list ?? []).slice(0, limit).map((row) => row.report_nm);
}
