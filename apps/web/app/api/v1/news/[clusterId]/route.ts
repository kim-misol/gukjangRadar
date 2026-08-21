import { getDb } from '@gukjang/db';
import { NextResponse } from 'next/server';
import { getNewsClusterDetail } from '../../../../../lib/api/queries';

/** GET /v1/news/{clusterId} — spec/openapi.yaml. docs/07-api-spec.md §2: s-maxage=120, SWR=600. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clusterId: string }> },
): Promise<NextResponse> {
  const clusterId = Number((await params).clusterId);
  if (!Number.isInteger(clusterId)) {
    return NextResponse.json(
      { code: 'INVALID_CLUSTER_ID', message: 'clusterId must be an integer' },
      { status: 400 },
    );
  }

  const cluster = await getNewsClusterDetail(getDb(), clusterId);
  if (!cluster) {
    return NextResponse.json(
      { code: 'NOT_FOUND', message: '뉴스 클러스터를 찾을 수 없습니다.' },
      { status: 404 },
    );
  }

  const cacheControl =
    cluster.analysisStatus === 'DONE'
      ? 'public, s-maxage=120, stale-while-revalidate=600'
      : 'no-store';
  return NextResponse.json(cluster, { headers: { 'Cache-Control': cacheControl } });
}
