import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { getSessionUser } from '../../../../lib/auth/session';
import { createAlertKeyword, listAlertKeywords } from '../../../../lib/api/alerts';

/** GET /v1/alerts — spec/openapi.yaml. */
export async function GET(): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }
  const items = await listAlertKeywords(getDb(), session.userId);
  return NextResponse.json({ items });
}

/** POST /v1/alerts — spec/openapi.yaml. */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' },
      { status: 401 },
    );
  }

  let body: { keyword?: string; minScore?: number; includeMeme?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'INVALID_BODY', message: 'JSON body가 필요합니다.' },
      { status: 400 },
    );
  }
  if (!body.keyword || !body.keyword.trim()) {
    return NextResponse.json(
      { code: 'MISSING_KEYWORD', message: 'keyword가 필요합니다.' },
      { status: 400 },
    );
  }
  if (body.keyword.length > 30) {
    return NextResponse.json(
      { code: 'KEYWORD_TOO_LONG', message: 'keyword는 30자 이하여야 합니다.' },
      { status: 400 },
    );
  }

  const result = await createAlertKeyword(getDb(), session.userId, {
    keyword: body.keyword.trim(),
    minScore: body.minScore,
    includeMeme: body.includeMeme,
  });

  if (!result.ok && result.error === 'PLAN_LIMIT') {
    return NextResponse.json(
      {
        code: 'PLAN_LIMIT_EXCEEDED',
        message: '무료 플랜은 키워드를 최대 5개까지 등록할 수 있습니다.',
      },
      { status: 402 },
    );
  }
  if (!result.ok) {
    return NextResponse.json(
      { code: 'DUPLICATE_KEYWORD', message: '이미 등록된 키워드입니다.' },
      { status: 409 },
    );
  }
  return NextResponse.json(result.alert, { status: 201 });
}
