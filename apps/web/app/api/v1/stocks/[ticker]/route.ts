import { getDb } from '@gukjang/db';
import { NextResponse } from 'next/server';
import { getStockDetail } from '../../../../../lib/api/queries';

/** GET /v1/stocks/{ticker} — spec/openapi.yaml. docs/07 §2: 시세 포함, s-maxage=30. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
): Promise<NextResponse> {
  const { ticker } = await params;
  const stock = await getStockDetail(getDb(), ticker);
  if (!stock) {
    return NextResponse.json(
      { code: 'NOT_FOUND', message: '종목을 찾을 수 없습니다.' },
      { status: 404 },
    );
  }
  return NextResponse.json(stock, { headers: { 'Cache-Control': 'public, s-maxage=30' } });
}
