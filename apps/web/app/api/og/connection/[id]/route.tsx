import { getDb } from '@gukjang/db';
import { ImageResponse } from 'next/og';
import { getConnectionById } from '../../../../../lib/api/queries';
import { fetchKoreanFont } from '../../../../../lib/og-font';

/**
 * GET /api/og/connection/{id} — docs/07-api-spec.md §8. 공유 카드 이미지.
 * 스펙은 edge runtime을 권장하지만, DB 클라이언트(postgres.js)가 Node.js 소켓 API에
 * 의존해 edge에서 못 돌아간다 — 이 프로젝트는 Route Handler가 DB를 직접 쿼리하는
 * BFF 구조라(docs/07 §1) nodejs 런타임으로 둔다(docs/15 W7 기록 참고).
 */
export const runtime = 'nodejs';

const WIDTH = 1200;
const HEIGHT = 630;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const connectionId = Number((await params).id);
  const connection = Number.isInteger(connectionId)
    ? await getConnectionById(getDb(), connectionId)
    : null;

  if (!connection) {
    return new ImageResponse(
      <div style={{ ...baseStyle }}>
        <p style={{ fontSize: 40 }}>국장레이더</p>
      </div>,
      { width: WIDTH, height: HEIGHT },
    );
  }

  const entityLabel = connection.path[0]?.label ?? connection.company.name;
  const arrowLabel = `${entityLabel} → ${connection.company.name}`;
  const disclaimer = '투자 추천·자문이 아닙니다';
  const fontData = await fetchKoreanFont(
    `국장레이더${arrowLabel}${connection.explanation}${disclaimer}0123456789%`,
  );

  return new ImageResponse(
    <div style={baseStyle}>
      <p style={{ fontSize: 28, color: '#666', margin: 0 }}>국장레이더</p>
      <p style={{ fontSize: 56, fontWeight: 700, margin: '24px 0 0' }}>{arrowLabel}</p>
      <p style={{ fontSize: 30, color: '#444', margin: '16px 0 0' }}>{connection.explanation}</p>
      <p style={{ fontSize: 26, color: '#222', margin: '32px 0 0' }}>
        연결 강도 {connection.scores.connection}
      </p>
      <p style={{ fontSize: 20, color: '#888', position: 'absolute', bottom: 32 }}>{disclaimer}</p>
    </div>,
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: fontData
        ? [{ name: 'Noto Sans KR', data: fontData, weight: 700 as const }]
        : undefined,
      headers: { 'Cache-Control': 'public, s-maxage=86400' },
    },
  );
}

const baseStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  // satori는 oklch()를 지원하지 않아(DOM 렌더러가 아님) 종이색 토큰을 hex로 근사한다.
  backgroundColor: '#f4f2ef',
  fontFamily: 'Noto Sans KR, sans-serif',
  padding: 60,
  textAlign: 'center',
};
