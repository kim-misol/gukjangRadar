import { getDb } from '@gukjang/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getMemeRank, latestTradeDate } from '../../../../../lib/api/queries';

/** GET /v1/discovery/meme — spec/openapi.yaml. docs/07 §2: s-maxage=300. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  const search = request.nextUrl.searchParams;
  const date = search.get('date') ?? (await latestTradeDate(db));
  const limit = Math.min(Number(search.get('limit') ?? 10), 50);

  const items = date ? await getMemeRank(db, date, limit) : [];
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, s-maxage=300' } });
}
