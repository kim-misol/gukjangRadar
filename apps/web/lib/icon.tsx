import { ImageResponse } from 'next/og';
import { fetchKoreanFont } from './og-font';

/**
 * T5.2 — PWA/파비콘 아이콘 렌더. `app/api/og/connection/[id]/route.tsx`와 같은 방식(next/og
 * ImageResponse, satori는 oklch() 미지원이라 종이색 토큰을 hex로 근사) — 별도 아이콘 파일을
 * 만들지 않고 이미 있는 렌더링 경로를 재사용한다.
 */
export async function renderAppIcon(size: number): Promise<ImageResponse> {
  const fontData = await fetchKoreanFont('국');
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f4f2ef',
        fontFamily: 'Noto Sans KR, sans-serif',
      }}
    >
      <p style={{ fontSize: size * 0.6, fontWeight: 700, color: '#262421', margin: 0 }}>국</p>
    </div>,
    {
      width: size,
      height: size,
      fonts: fontData
        ? [{ name: 'Noto Sans KR', data: fontData, weight: 700 as const }]
        : undefined,
      headers: { 'Cache-Control': 'public, s-maxage=86400' },
    },
  );
}
