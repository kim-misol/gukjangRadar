/**
 * T4.2 — 관리자 API 인가. docs/07 §5 "관리자 API는 별도 role 클레임 + IP 허용목록"의 V1
 * 임시 버전: 1인 운영이라 공유 시크릿 헤더로 대체한다(ADMIN_API_TOKEN, docs/15 W8 참고).
 * ADMIN_API_TOKEN이 설정 안 돼 있으면(로컬 기본값 등) 항상 거부한다 — 빈 문자열끼리
 * 비교해 통과되는 사고를 막기 위함.
 */
import { loadEnv } from '@gukjang/core';

export function isAuthorizedAdminRequest(request: Request): boolean {
  const env = loadEnv();
  if (!env.ADMIN_API_TOKEN) return false;
  return request.headers.get('x-admin-token') === env.ADMIN_API_TOKEN;
}
