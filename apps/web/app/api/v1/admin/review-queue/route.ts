import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { isAuthorizedAdminRequest } from '../../../../../lib/auth/admin-guard';
import { listReviewQueue } from '../../../../../lib/api/admin';

/** GET /v1/admin/review-queue — spec/openapi.yaml. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '관리자 인증이 필요합니다.' },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const minScore = Number(url.searchParams.get('minScore') ?? '0');
  const onlyFlaggedParam = url.searchParams.get('onlyFlagged');
  const onlyFlagged = onlyFlaggedParam === null ? true : onlyFlaggedParam !== 'false';

  const items = await listReviewQueue(getDb(), {
    minScore: Number.isFinite(minScore) ? minScore : 0,
    onlyFlagged,
  });
  return NextResponse.json({ items });
}
