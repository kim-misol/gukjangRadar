import { renderAppIcon } from '../lib/icon';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** iOS 홈화면 추가 시 쓰는 apple-touch-icon — Next.js 특수 파일 관례. */
export default async function AppleIcon(): Promise<Response> {
  return renderAppIcon(180);
}
