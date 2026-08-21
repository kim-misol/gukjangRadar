import { describe, expect, it, vi } from 'vitest';
import { AnthropicLlmClient, LlmValidationError } from './anthropic-client';
import type Anthropic from '@anthropic-ai/sdk';

function fakeMessage(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: [],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      server_tool_use: null,
      inference_geo: null,
    },
    container: null,
    context_management: null,
    ...overrides,
  } as unknown as Anthropic.Message;
}

function toolUseBlock(id: string, input: unknown): Anthropic.ContentBlock {
  return {
    type: 'tool_use',
    id,
    name: 'emit_test',
    input,
    caller: { type: 'direct' },
  } as unknown as Anthropic.ContentBlock;
}

const TOOL = {
  name: 'emit_test',
  description: 'test tool',
  inputSchema: { type: 'object' as const, properties: {}, required: [] },
};

function okParse(raw: unknown) {
  return { success: true as const, data: raw };
}

describe('AnthropicLlmClient.callTool', () => {
  it('tool_use 블록을 찾아 파싱 결과를 반환한다', async () => {
    const create = vi.fn().mockResolvedValue(
      fakeMessage({
        content: [toolUseBlock('t1', { ok: true })],
      }),
    );
    const client = new AnthropicLlmClient({ client: { messages: { create } } as never });

    const result = await client.callTool({
      model: 'claude-haiku-4-5',
      system: 'sys',
      userContent: 'user',
      tool: TOOL,
      parseOutput: okParse,
    });

    expect(result.output).toEqual({ ok: true });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    expect(result.attempts).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('tool_choice로 특정 도구 호출을 강제한다', async () => {
    const create = vi.fn().mockResolvedValue(fakeMessage({ content: [toolUseBlock('t1', {})] }));
    const client = new AnthropicLlmClient({ client: { messages: { create } } as never });
    await client.callTool({
      model: 'claude-haiku-4-5',
      system: 'sys',
      userContent: 'user',
      tool: TOOL,
      parseOutput: okParse,
    });
    const params = create.mock.calls[0]?.[0];
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'emit_test' });
    expect(params.temperature).toBe(0);
    expect(params.tools[0].strict).toBe(true);
  });

  it('파싱 실패 시 1회 재시도 후 성공하면 두 시도의 토큰을 합산한다', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(fakeMessage({ content: [toolUseBlock('t1', { bad: true })] }))
      .mockResolvedValueOnce(fakeMessage({ content: [toolUseBlock('t2', { ok: true })] }));
    const client = new AnthropicLlmClient({ client: { messages: { create } } as never });

    let call = 0;
    const result = await client.callTool({
      model: 'claude-haiku-4-5',
      system: 'sys',
      userContent: 'user',
      tool: TOOL,
      parseOutput: (raw) => {
        call++;
        return call === 1 ? { success: false, error: 'invalid' } : { success: true, data: raw };
      },
    });

    expect(result.attempts).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('재시도까지 소진하면 LlmValidationError를 던지고 누적 usage를 담는다', async () => {
    const create = vi.fn().mockResolvedValue(fakeMessage({ content: [toolUseBlock('t1', {})] }));
    const client = new AnthropicLlmClient({ client: { messages: { create } } as never });

    await expect(
      client.callTool({
        model: 'claude-haiku-4-5',
        system: 'sys',
        userContent: 'user',
        tool: TOOL,
        parseOutput: () => ({ success: false, error: 'always invalid' }),
      }),
    ).rejects.toThrow(LlmValidationError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('tool_use 블록이 없으면(stop_reason=end_turn 등) 재시도 후 실패한다', async () => {
    const create = vi.fn().mockResolvedValue(fakeMessage({ content: [], stop_reason: 'end_turn' }));
    const client = new AnthropicLlmClient({ client: { messages: { create } } as never });

    await expect(
      client.callTool({
        model: 'claude-haiku-4-5',
        system: 'sys',
        userContent: 'user',
        tool: TOOL,
        parseOutput: okParse,
      }),
    ).rejects.toThrow(/tool_use 블록 없음/);
  });
});
