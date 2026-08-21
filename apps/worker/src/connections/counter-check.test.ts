import { describe, expect, it, vi } from 'vitest';
import type { getDb } from '@gukjang/db';
import { runCounterCheck } from './counter-check';

/**
 * getTodaySpendUsd는 `.where(...)`를 직접 await하고(orderBy/limit 없이),
 * findCachedOutput은 `.where().orderBy().limit()`을 쓴다 — 두 모양을 동시에 지원해야 해서
 * where()가 "빈 배열로 즉시 resolve되는 Promise"이면서 동시에 `.orderBy()`도 갖게 만든다.
 */
function fakeDb() {
  const whereResult = Promise.resolve([]) as unknown as Promise<unknown[]> & {
    orderBy: () => { limit: () => Promise<unknown[]> };
  };
  whereResult.orderBy = () => ({ limit: async () => [] });
  return {
    select: () => ({
      from: () => ({
        where: () => whereResult,
      }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [{ id: 1 }] }),
    }),
  } as unknown as ReturnType<typeof getDb>;
}

const now = new Date('2026-08-21T04:00:00Z');
const baseInput = {
  clusterId: 1,
  claim: 'AI 가속기에 탑재되는 HBM을 공급하는 관계로 연결됩니다.',
  companyId: 201,
  companyName: 'SK하이닉스',
  ticker: '000660',
  corpCode: '00164779',
  businessSummary: 'HBM 등 메모리반도체 제조',
};

describe('runCounterCheck', () => {
  it('refuted:true면 조정된 relevance/reason을 돌려준다', async () => {
    const dartClient = {
      fetchDisclosureList: vi
        .fn()
        .mockResolvedValue({ status: '000', message: '정상', list: [{ report_nm: 'x' }] }),
    };
    const llmClient = {
      callTool: vi.fn().mockResolvedValue({
        output: { refuted: true, reason: '근거가 확인되지 않습니다.', adjusted_relevance: 15 },
        usage: { inputTokens: 10, outputTokens: 10 },
        latencyMs: 5,
        rawOutput: {},
        attempts: 1,
      }),
    };
    const result = await runCounterCheck(
      { db: fakeDb(), llmClient, dartClient, model: 'claude-sonnet-5', dailyCostCapUsd: 20, now },
      baseInput,
      85,
    );
    expect(result).toEqual({
      refuted: true,
      reason: '근거가 확인되지 않습니다.',
      adjustedRelevance: 15,
    });
  });

  it('refuted:false면 원래 relevance를 그대로 돌려준다(reason은 null)', async () => {
    const dartClient = {
      fetchDisclosureList: vi.fn().mockResolvedValue({ status: '013', message: '없음' }),
    };
    const llmClient = {
      callTool: vi.fn().mockResolvedValue({
        output: { refuted: false, reason: '근거가 확인됩니다.', adjusted_relevance: 85 },
        usage: { inputTokens: 10, outputTokens: 10 },
        latencyMs: 5,
        rawOutput: {},
        attempts: 1,
      }),
    };
    const result = await runCounterCheck(
      { db: fakeDb(), llmClient, dartClient, model: 'claude-sonnet-5', dailyCostCapUsd: 20, now },
      baseInput,
      85,
    );
    expect(result).toEqual({ refuted: false, reason: null, adjustedRelevance: 85 });
  });

  it('corpCode가 없으면 DART를 호출하지 않고 공시 없음으로 진행한다', async () => {
    const dartClient = { fetchDisclosureList: vi.fn() };
    const llmClient = {
      callTool: vi.fn().mockResolvedValue({
        output: { refuted: false, reason: 'ok', adjusted_relevance: 70 },
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
        rawOutput: {},
        attempts: 1,
      }),
    };
    await runCounterCheck(
      { db: fakeDb(), llmClient, dartClient, model: 'claude-sonnet-5', dailyCostCapUsd: 20, now },
      { ...baseInput, corpCode: null },
      70,
    );
    expect(dartClient.fetchDisclosureList).not.toHaveBeenCalled();
  });

  it('DART 호출이 실패해도(fail open) LLM 호출은 계속 진행한다', async () => {
    const dartClient = { fetchDisclosureList: vi.fn().mockRejectedValue(new Error('network')) };
    const llmClient = {
      callTool: vi.fn().mockResolvedValue({
        output: { refuted: false, reason: 'ok', adjusted_relevance: 70 },
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
        rawOutput: {},
        attempts: 1,
      }),
    };
    const result = await runCounterCheck(
      { db: fakeDb(), llmClient, dartClient, model: 'claude-sonnet-5', dailyCostCapUsd: 20, now },
      baseInput,
      70,
    );
    expect(llmClient.callTool).toHaveBeenCalledTimes(1);
    expect(result.refuted).toBe(false);
  });

  it('LLM 호출이 실패하면(fail open) 원래 relevance를 그대로 돌려준다', async () => {
    const dartClient = {
      fetchDisclosureList: vi.fn().mockResolvedValue({ status: '013', message: '없음' }),
    };
    const llmClient = { callTool: vi.fn().mockRejectedValue(new Error('boom')) };
    const result = await runCounterCheck(
      { db: fakeDb(), llmClient, dartClient, model: 'claude-sonnet-5', dailyCostCapUsd: 20, now },
      baseInput,
      85,
    );
    expect(result).toEqual({ refuted: false, reason: null, adjustedRelevance: 85 });
  });

  it('일일 비용 상한을 넘으면 LLM을 호출하지 않고 원래 값을 돌려준다', async () => {
    const dartClient = {
      fetchDisclosureList: vi.fn().mockResolvedValue({ status: '013', message: '없음' }),
    };
    const llmClient = { callTool: vi.fn() };
    const result = await runCounterCheck(
      { db: fakeDb(), llmClient, dartClient, model: 'claude-sonnet-5', dailyCostCapUsd: 0, now },
      baseInput,
      85,
    );
    expect(llmClient.callTool).not.toHaveBeenCalled();
    expect(result).toEqual({ refuted: false, reason: null, adjustedRelevance: 85 });
  });
});
