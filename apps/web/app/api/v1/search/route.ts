import { getDb } from '@gukjang/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getSearchResults } from '../../../../lib/api/queries';

const VALID_KINDS = new Set(['all', 'news', 'company', 'keyword']);

/** GET /v1/search — spec/openapi.yaml. docs/05 S6. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const search = request.nextUrl.searchParams;
  const q = search.get('q');
  if (!q || q.length === 0) {
    return NextResponse.json(
      { code: 'MISSING_QUERY', message: 'q가 필요합니다.' },
      { status: 400 },
    );
  }
  const kindParam = search.get('kind') ?? 'all';
  const kind = VALID_KINDS.has(kindParam)
    ? (kindParam as 'all' | 'news' | 'company' | 'keyword')
    : 'all';

  const result = await getSearchResults(getDb(), q, kind);
  return NextResponse.json(result);
}
