import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '국장레이더',
  description: '뉴스와 종목 사이의 숨은 연결고리를 발견하는 서비스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
