import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { isAuthorizedAdminRequest } from '../../../../../lib/auth/admin-guard';
import { getPipelineHealth } from '../../../../../lib/api/pipeline-health';

/** GET /v1/admin/pipeline-health — T4.3(D4) 파이프라인 대시보드. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '관리자 인증이 필요합니다.' },
      { status: 401 },
    );
  }
  const summary = await getPipelineHealth(getDb());
  return NextResponse.json(summary);
}
