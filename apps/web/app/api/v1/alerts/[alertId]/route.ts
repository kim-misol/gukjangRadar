import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { getSessionUser } from '../../../../../lib/auth/session';
import { deleteAlertKeyword } from '../../../../../lib/api/alerts';

/** DELETE /v1/alerts/{alertId} — spec/openapi.yaml. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ alertId: string }> },
): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }
  const alertId = Number((await params).alertId);
  if (!Number.isInteger(alertId)) {
    return NextResponse.json(
      { code: 'INVALID_ALERT_ID', message: 'alertId must be an integer' },
      { status: 400 },
    );
  }
  await deleteAlertKeyword(getDb(), session.userId, alertId);
  return new NextResponse(null, { status: 204 });
}
