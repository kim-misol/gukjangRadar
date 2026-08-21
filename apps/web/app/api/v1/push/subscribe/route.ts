import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { getSessionUser } from '../../../../../lib/auth/session';
import { subscribePush } from '../../../../../lib/api/push';

/** POST /v1/push/subscribe — spec/openapi.yaml. */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'INVALID_BODY', message: 'JSON body가 필요합니다.' },
      { status: 400 },
    );
  }
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json(
      { code: 'INVALID_SUBSCRIPTION', message: 'endpoint/keys.p256dh/keys.auth가 필요합니다.' },
      { status: 400 },
    );
  }

  await subscribePush(getDb(), session.userId, {
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
  });
  return new NextResponse(null, { status: 201 });
}
