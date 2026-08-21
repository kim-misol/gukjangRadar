import { renderAppIcon } from '../../../lib/icon';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return renderAppIcon(512);
}
