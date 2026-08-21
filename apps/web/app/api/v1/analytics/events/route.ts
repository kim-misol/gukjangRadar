import { NextResponse } from 'next/server';
import { ANALYTICS_EVENTS } from '../../../../../lib/analytics/events';

const EVENT_NAME_SET = new Set<string>(ANALYTICS_EVENTS);

/**
 * POST /v1/analytics/events — T5.3 스텁 싱크. 실 분석 프로바이더가 정해지기 전까지는
 * 구조화 로그로만 남긴다(운영 로그 수집기가 있으면 거기서 집계 가능). `sendBeacon`으로
 * 오는 요청은 응답 본문을 읽지 않으므로 204만 돌려준다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  if (body && typeof body.name === 'string' && EVENT_NAME_SET.has(body.name)) {
    console.log('[analytics]', JSON.stringify(body));
  }
  return new NextResponse(null, { status: 204 });
}
