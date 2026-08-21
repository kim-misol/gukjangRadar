import { CONNECTION_KINDS, type ConnectionKind } from '@gukjang/spec';
import { getDb } from '@gukjang/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getConnectionsForCluster } from '../../../../../../lib/api/queries';

const CONNECTION_KIND_SET = new Set<string>(CONNECTION_KINDS);

function isConnectionKind(value: string): value is ConnectionKind {
  return CONNECTION_KIND_SET.has(value);
}

/** GET /v1/news/{clusterId}/connections — spec/openapi.yaml. */
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
  const typeParam = search.get('type');
  const types = typeParam?.split(',').filter(isConnectionKind);
  const sortParam = search.get('sort');
  const sort = sortParam === 'market' || sortParam === 'business' ? sortParam : 'connection';

  const items = await getConnectionsForCluster(getDb(), clusterId, {
    types,
    sort,
    businessOnly: search.get('businessOnly') === 'true',
    includeMeme: search.get('includeMeme') !== 'false',
  });

  return NextResponse.json({ items });
}
