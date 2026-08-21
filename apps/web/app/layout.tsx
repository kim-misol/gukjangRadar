import type { Metadata, Viewport } from 'next';
import { BottomNav } from '../components/layout/bottom-nav';
import { DisclaimerBlock } from '../components/ui/disclaimer-block';
import { Masthead } from '../components/layout/masthead';
import { jetBrainsMono, notoSansKr, notoSerifKr } from '../lib/fonts';
import { cn } from '../lib/utils';
import './globals.css';

export const metadata: Metadata = {
  title: '국장레이더',
  description: '뉴스와 종목 사이의 숨은 연결고리를 발견하는 서비스',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '국장레이더' },
};

export const viewport: Viewport = { themeColor: '#f4f2ef' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={cn(notoSerifKr.variable, notoSansKr.variable, jetBrainsMono.variable)}
    >
      <body className="min-h-screen bg-paper font-sans text-ink">
        <Masthead />
        <div className="pb-16 md:pb-0">{children}</div>
        <DisclaimerBlock />
        <BottomNav />
      </body>
    </html>
  );
}
