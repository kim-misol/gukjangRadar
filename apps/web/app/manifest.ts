import type { MetadataRoute } from 'next';

/** T5.2 — PWA 매니페스트. Next.js 특수 파일 관례(/manifest.webmanifest 자동 서빙). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '국장레이더',
    short_name: '국장레이더',
    description: '뉴스와 종목 사이의 숨은 연결고리를 발견하는 서비스',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f2ef',
    theme_color: '#f4f2ef',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
