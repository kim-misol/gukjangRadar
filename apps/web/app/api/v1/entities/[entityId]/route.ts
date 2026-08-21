import { getDb } from '@gukjang/db';
import { NextResponse } from 'next/server';
import { getEntityDetail } from '../../../../../lib/api/queries';

/** GET /v1/entities/{entityId} — spec/openapi.yaml. C9 개체 허브(V1.1). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entityId: string }> },
): Promise<NextResponse> {
  const entityId = Number((await params).entityId);
  if (!Number.isInteger(entityId)) {
    return NextResponse.json(
      { code: 'INVALID_ENTITY_ID', message: 'entityId must be an integer' },
      { status: 400 },
    );
  }
  const detail = await getEntityDetail(getDb(), entityId);
  if (!detail) {
    return NextResponse.json(
      { code: 'NOT_FOUND', message: '개체를 찾을 수 없습니다.' },
      { status: 404 },
    );
  }
  return NextResponse.json(detail, { headers: { 'Cache-Control': 'public, s-maxage=120' } });
}
