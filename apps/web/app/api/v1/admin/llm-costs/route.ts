import { NextResponse } from 'next/server';
import { getDb } from '@gukjang/db';
import { loadEnv } from '@gukjang/core';
import { isAuthorizedAdminRequest } from '../../../../../lib/auth/admin-guard';
import { getLlmCostSummary } from '../../../../../lib/api/llm-costs';

/** GET /v1/admin/llm-costs — T5(D5) LLM 비용 모니터. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedAdminRequest(request)) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '관리자 인증이 필요합니다.' },
      { status: 401 },
    );
  }
  const summary = await getLlmCostSummary(getDb(), loadEnv().LLM_DAILY_COST_CAP_USD);
  return NextResponse.json(summary);
}
