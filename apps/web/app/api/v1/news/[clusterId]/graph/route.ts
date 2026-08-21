import { getDb } from '@gukjang/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getGraphForCluster } from '../../../../../../lib/api/queries';

/** GET /v1/news/{clusterId}/graph — spec/openapi.yaml. docs/07 §2: 무겁고 잘 안 변함, s-maxage=300. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> },
): Promise<NextResponse> {
  const clusterId = Number((await params).clusterId);
  if (!Number.isInteger(clusterId)) {
    return NextResponse.json(
      { code: 'INVALID_CLUSTER_ID', message: 'clusterId must be an integer' },
      { status: 400 },
    );
  }

  const search = request.nextUrl.searchParams;
  const maxNodes = Math.min(Number(search.get('maxNodes') ?? 60), 200);
  const minScore = Number(search.get('minScore') ?? 0);

  const graph = await getGraphForCluster(getDb(), clusterId, { maxNodes, minScore });
  if (!graph) {
    return NextResponse.json(
      { code: 'NOT_FOUND', message: '뉴스 클러스터를 찾을 수 없습니다.' },
      { status: 404 },
    );
  }

  return NextResponse.json(graph, {
    headers: { 'Cache-Control': 'public, s-maxage=300' },
  });
}
