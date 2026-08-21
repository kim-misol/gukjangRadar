import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { getSessionUser } from '../../../../lib/auth/session';
import { listBookmarkedConnections } from '../../../../lib/api/bookmarks';

/** GET /v1/bookmarks — C12(V1.1). */
export async function GET(): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }
  const items = await listBookmarkedConnections(getDb(), session.userId);
  return NextResponse.json({ items });
}
