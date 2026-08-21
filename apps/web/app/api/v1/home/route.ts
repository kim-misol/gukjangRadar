import { getDb } from '@gukjang/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getHomeData } from '../../../../lib/api/queries';

/** GET /v1/home — spec/openapi.yaml. docs/07-api-spec.md §2 캐시: s-maxage=60, SWR=300. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const date = request.nextUrl.searchParams.get('date') ?? undefined;
  const home = await getHomeData(getDb(), date);

  return NextResponse.json(home, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
