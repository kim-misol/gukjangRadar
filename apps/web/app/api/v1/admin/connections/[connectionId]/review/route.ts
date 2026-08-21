import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { isAuthorizedAdminRequest } from '../../../../../../../lib/auth/admin-guard';
import { submitConnectionReview, type ReviewAction } from '../../../../../../../lib/api/admin';

const ACTIONS = new Set<string>(['APPROVE', 'REJECT', 'CORRECT']);

/** POST /v1/admin/connections/{connectionId}/review — spec/openapi.yaml. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '관리자 인증이 필요합니다.' },
      { status: 401 },
    );
  }

  const connectionId = Number((await params).connectionId);
  if (!Number.isInteger(connectionId)) {
    return NextResponse.json(
      { code: 'INVALID_CONNECTION_ID', message: 'connectionId must be an integer' },
      { status: 400 },
    );
  }

  let body: {
    action?: string;
    reason?: string;
    patch?: { businessRelevance?: number; explanation?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'INVALID_BODY', message: 'JSON body가 필요합니다.' },
      { status: 400 },
    );
  }
  if (!body.action || !ACTIONS.has(body.action)) {
    return NextResponse.json(
      { code: 'INVALID_ACTION', message: 'action은 APPROVE/REJECT/CORRECT 중 하나여야 합니다.' },
      { status: 400 },
    );
  }

  await submitConnectionReview(getDb(), connectionId, 'admin', {
    action: body.action as ReviewAction,
    reason: body.reason,
    patch: body.patch,
  });
  return new NextResponse(null, { status: 204 });
}
