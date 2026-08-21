import { Noto_Sans_KR, Noto_Serif_KR, JetBrains_Mono } from 'next/font/google';

/** 헤드라인 / 마스트헤드 서체 (docs/17-screen-design-guide.md §디자인 토큰) */
export const notoSerifKr = Noto_Serif_KR({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-noto-serif-kr',
  display: 'swap',
});

/** 본문 / 메타 서체 */
export const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-sans-kr',
  display: 'swap',
});

/** 숫자·코드성 텍스트(HEAT·등락률·시각) 서체 */
export const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
