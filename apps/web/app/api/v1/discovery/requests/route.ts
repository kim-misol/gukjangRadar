import { getDb } from '@gukjang/db';
import { NextResponse } from 'next/server';
import { submitDiscoveryRequest } from '../../../../../lib/api/discovery';

const MAX_KEYWORD_LENGTH = 40;

/** POST /v1/discovery/requests — spec/openapi.yaml. PRD D2: 1:1 응답 없이 공개 큐에만 등록. */
export async function POST(request: Request): Promise<NextResponse> {
  let body: { keyword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'INVALID_BODY', message: 'JSON body가 필요합니다.' },
      { status: 400 },
    );
  }

  const keyword = body.keyword?.trim();
  if (!keyword || keyword.length === 0 || keyword.length > MAX_KEYWORD_LENGTH) {
    return NextResponse.json(
      { code: 'INVALID_KEYWORD', message: `keyword는 1~${MAX_KEYWORD_LENGTH}자여야 합니다.` },
      { status: 400 },
    );
  }

  const { requestId } = await submitDiscoveryRequest(getDb(), keyword);
  return NextResponse.json({ requestId, status: 'PENDING' }, { status: 202 });
}
