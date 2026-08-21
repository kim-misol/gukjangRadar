import { schema, type getDb } from '@gukjang/db';

type Db = ReturnType<typeof getDb>;

/**
 * POST /v1/discovery/requests — spec/openapi.yaml. PRD D2 준수: 1:1 응답 없이 공개 탐색 큐에만
 * 등록한다. IP/계정 한도(docs/07 §4)는 레이트리밋 미들웨어가 아직 없어 이번 주는 적용하지
 * 않는다 — W8 인증 붙을 때 같이 넣는다(미룬 것).
 */
export async function submitDiscoveryRequest(
  db: Db,
  keyword: string,
): Promise<{ requestId: number }> {
  const [row] = await db
    .insert(schema.discoveryRequest)
    .values({ keyword, status: 'PENDING' })
    .returning({ id: schema.discoveryRequest.id });
  if (!row) throw new Error('discovery_request 생성 실패');
  return { requestId: row.id };
}
