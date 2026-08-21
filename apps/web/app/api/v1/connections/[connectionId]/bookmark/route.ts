import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { getSessionUser } from '../../../../../../lib/auth/session';
import { createBookmark, deleteBookmark } from '../../../../../../lib/api/bookmarks';

function parseConnectionId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** POST /v1/connections/{connectionId}/bookmark — C12(V1.1). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }
  const connectionId = parseConnectionId((await params).connectionId);
  if (connectionId === null) {
    return NextResponse.json(
      { code: 'INVALID_CONNECTION_ID', message: 'connectionId must be an integer' },
      { status: 400 },
    );
  }
  await createBookmark(getDb(), session.userId, connectionId);
  return new NextResponse(null, { status: 201 });
}

/** DELETE /v1/connections/{connectionId}/bookmark — C12(V1.1). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }
  const connectionId = parseConnectionId((await params).connectionId);
  if (connectionId === null) {
    return NextResponse.json(
      { code: 'INVALID_CONNECTION_ID', message: 'connectionId must be an integer' },
      { status: 400 },
    );
  }
  await deleteBookmark(getDb(), session.userId, connectionId);
  return new NextResponse(null, { status: 204 });
}
