/**
 * T2.2.1 — Claude API 클라이언트 래퍼. docs/11 §2-⑤⑥, docs/14 T2.2.1:
 * tool_use 강제(tool_choice + strict), JSON 검증(zod, 호출부가 parseOutput으로 주입),
 * 실패 시 1회 재시도, 토큰 사용량 반환(비용 기록은 llm-run-store가 한다 — 이 클래스는
 * 순수하게 "호출"만 책임진다).
 *
 * W7 라이브 검증에서 발견: `temperature`는 현재 모델 세대(Sonnet 5 등)에서 아예
 * 제거돼 400을 반환한다 — "temperature 0으로 결정론적 호출"은 더 이상 가능한
 * 옵션이 아니다(docs/15 W7 기록 참고). tool_choice로 도구 하나를 강제하는 구조 자체가
 * 이미 출력 형태를 크게 제약하므로 온도 없이도 충분히 안정적이다.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';

export interface AnthropicLlmClientOptions {
  apiKey?: string;
  /** 테스트/모킹용 주입 지점. 기본값은 실제 Anthropic SDK 클라이언트. */
  client?: Pick<Anthropic, 'messages'>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Tool.InputSchema;
}

export type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

export interface CallToolParams<T> {
  model: string;
  system: string;
  userContent: string;
  tool: ToolDefinition;
  maxTokens?: number;
  parseOutput: (raw: unknown) => ParseResult<T>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CallToolResult<T> {
  output: T;
  /** 재시도가 있었다면 시도 전체를 합산한 값 — 둘 다 과금되므로. */
  usage: TokenUsage;
  latencyMs: number;
  rawOutput: unknown;
  attempts: number;
}

const MAX_ATTEMPTS = 2;

export class AnthropicLlmClient {
  private readonly client: Pick<Anthropic, 'messages'>;

  constructor(options: AnthropicLlmClientOptions = {}) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey });
  }

  async callTool<T>(params: CallToolParams<T>): Promise<CallToolResult<T>> {
    const started = Date.now();
    const tool: Tool = {
      name: params.tool.name,
      description: params.tool.description,
      input_schema: params.tool.inputSchema,
      strict: true,
    };
    const messages: MessageParam[] = [{ role: 'user', content: params.userContent }];

    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let lastError = '알 수 없는 오류';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await this.client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens ?? 4096,
        system: params.system,
        messages,
        tools: [tool],
        tool_choice: { type: 'tool', name: params.tool.name },
      });

      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;

      const toolUse = response.content.find(
        (block): block is ToolUseBlock => block.type === 'tool_use',
      );
      if (!toolUse) {
        lastError = `tool_use 블록 없음 (stop_reason=${response.stop_reason})`;
        continue;
      }

      const parsed = params.parseOutput(toolUse.input);
      if (parsed.success) {
        return {
          output: parsed.data,
          usage,
          latencyMs: Date.now() - started,
          rawOutput: toolUse.input,
          attempts: attempt,
        };
      }
      lastError = parsed.error;
    }

    throw new LlmValidationError(
      `LLM tool_use 응답 검증 실패 (${MAX_ATTEMPTS}회 재시도 소진): ${lastError}`,
      usage,
    );
  }
}

/** callTool이 재시도까지 소진하고도 실패하면 던진다 — 이미 발생한 비용(usage)을 함께 들고 있다. */
export class LlmValidationError extends Error {
  constructor(
    message: string,
    public readonly usage: TokenUsage,
  ) {
    super(message);
    this.name = 'LlmValidationError';
  }
}
