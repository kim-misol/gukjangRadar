import { NextResponse } from 'next/server';
import { clearSessionCookies } from '../../../../../lib/auth/session';

/** POST /v1/auth/logout — spec/openapi.yaml. */
export async function POST(): Promise<NextResponse> {
  await clearSessionCookies();
  return new NextResponse(null, { status: 204 });
}
