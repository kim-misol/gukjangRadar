import { getDb } from '@gukjang/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getConnectionsForStock } from '../../../../../../lib/api/queries';

/** GET /v1/stocks/{ticker}/connections — spec/openapi.yaml. 역방향, 연결 없으면 빈 배열(R1). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
): Promise<NextResponse> {
  const { ticker } = await params;
  const search = request.nextUrl.searchParams;
  const date = search.get('date') ?? undefined;
  const daysParam = search.get('days');
  const days = daysParam ? Math.min(Number(daysParam), 30) : undefined;

  const items = await getConnectionsForStock(getDb(), ticker, { date, days });
  return NextResponse.json({ items });
}
