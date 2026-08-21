import { FEEDBACK_KINDS, type FeedbackKind } from '@gukjang/spec';
import { getDb } from '@gukjang/db';
import { NextResponse } from 'next/server';
import { submitConnectionFeedback } from '../../../../../../lib/api/feedback';

const FEEDBACK_KIND_SET = new Set<string>(FEEDBACK_KINDS);

/** POST /v1/connections/{connectionId}/feedback — spec/openapi.yaml. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  const connectionId = Number((await params).connectionId);
  if (!Number.isInteger(connectionId)) {
    return NextResponse.json(
      { code: 'INVALID_CONNECTION_ID', message: 'connectionId must be an integer' },
      { status: 400 },
    );
  }

  let body: { kind?: string; anonId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'INVALID_BODY', message: 'JSON body가 필요합니다.' },
      { status: 400 },
    );
  }

  if (!body.kind || !FEEDBACK_KIND_SET.has(body.kind)) {
    return NextResponse.json(
      { code: 'INVALID_KIND', message: `kind는 ${FEEDBACK_KINDS.join('/')} 중 하나여야 합니다.` },
      { status: 400 },
    );
  }
  if (!body.anonId) {
    return NextResponse.json(
      { code: 'MISSING_ANON_ID', message: 'anonId가 필요합니다.' },
      { status: 400 },
    );
  }

  const result = await submitConnectionFeedback(
    getDb(),
    connectionId,
    body.kind as FeedbackKind,
    body.anonId,
  );
  if (result === 'ALREADY_SUBMITTED') {
    return NextResponse.json(
      { code: 'ALREADY_SUBMITTED', message: '이미 제출했습니다.' },
      { status: 409 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
