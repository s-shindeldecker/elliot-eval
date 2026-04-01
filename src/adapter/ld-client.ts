import { init, type LDClient } from '@launchdarkly/node-server-sdk';
import { initAi, type LDAIClient, type LDAICompletionConfig } from '@launchdarkly/server-sdk-ai';
import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Singleton LaunchDarkly + OpenAI client management
// ---------------------------------------------------------------------------

let ldClient: LDClient | undefined;
let aiClient: LDAIClient | undefined;
let openaiClient: OpenAI | undefined;
let initPromise: Promise<void> | undefined;

async function ensureLD(): Promise<LDAIClient> {
  if (aiClient) return aiClient;

  const sdkKey = process.env.LD_SDK_KEY;
  if (!sdkKey) throw new Error('LD_SDK_KEY environment variable is required');

  if (!initPromise) {
    const client = init(sdkKey);
    initPromise = client.waitForInitialization({ timeout: 10 }).then(() => {
      ldClient = client;
      aiClient = initAi(client);
    });
  }

  await initPromise;
  return aiClient!;
}

function ensureOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

export async function closeLDClient(): Promise<void> {
  if (ldClient) {
    await ldClient.close();
    ldClient = undefined;
    aiClient = undefined;
    initPromise = undefined;
  }
}

const shutdown = (code: number) => () => {
  closeLDClient().finally(() => process.exit(code));
};
process.once('SIGINT', shutdown(130));
process.once('SIGTERM', shutdown(143));

// ---------------------------------------------------------------------------
// Invoke helper — retrieves AI Config and calls the model
// ---------------------------------------------------------------------------

export interface LDInvokeResult {
  rawText: string;
  latencyMs: number;
  tokens?: { input: number; output: number; total: number };
  model?: string;
  error?: string;
}

export interface LDInvokeOptions {
  aiConfigKey: string;
  contextKind: string;
  contextKey: string;
  variables: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Tool-use types for the agent loop
// ---------------------------------------------------------------------------

export interface ToolDefinitionForLD {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error?: string }>;

export interface LDToolUseOptions extends LDInvokeOptions {
  /** Tool definitions to pass to the model */
  tools: ToolDefinitionForLD[];
  /** Function that executes a tool call and returns the result */
  executeToolCall: ToolExecutor;
  /** User message to send (replaces variables-based input_text) */
  userMessage: string;
  /** Max tool-call iterations before forcing a final response (default 10) */
  maxIterations?: number;
}

export interface LDToolUseResult extends LDInvokeResult {
  /** Number of tool-call iterations performed */
  iterations: number;
  /** Tool calls made during the conversation */
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
}

// ---------------------------------------------------------------------------
// Simple invoke — no tool use (existing behavior)
// ---------------------------------------------------------------------------

export async function invokeLDAIConfig(opts: LDInvokeOptions): Promise<LDInvokeResult> {
  const start = performance.now();

  try {
    const ai = await ensureLD();
    const openai = ensureOpenAI();

    const context = { kind: opts.contextKind, key: opts.contextKey };

    const aiConfig: LDAICompletionConfig = await ai.completionConfig(
      opts.aiConfigKey,
      context,
      { enabled: false },
      opts.variables,
    );

    if (!aiConfig.enabled) {
      return {
        rawText: '',
        latencyMs: Math.round(performance.now() - start),
        error: `AI Config "${opts.aiConfigKey}" is disabled or unavailable (fallback returned)`,
      };
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] =
      (aiConfig.messages ?? []).map(m => ({
        role: m.role,
        content: m.content,
      }));

    const modelName = aiConfig.model?.name ?? 'gpt-4';
    const params = aiConfig.model?.parameters ?? {};

    const callOpenAI = () =>
      openai.chat.completions.create({
        model: modelName,
        messages,
        response_format: { type: "json_object" },
        ...(params.temperature != null && { temperature: Number(params.temperature) }),
        ...(params.maxTokens != null && { max_tokens: Number(params.maxTokens) }),
      });

    const completion = aiConfig.tracker
      ? await aiConfig.tracker.trackOpenAIMetrics(callOpenAI)
      : await callOpenAI();

    const rawText = completion.choices[0]?.message?.content ?? '';
    const latencyMs = Math.round(performance.now() - start);

    return {
      rawText,
      latencyMs,
      model: completion.model,
      ...(completion.usage && {
        tokens: {
          input: completion.usage.prompt_tokens ?? 0,
          output: completion.usage.completion_tokens ?? 0,
          total: completion.usage.total_tokens ?? 0,
        },
      }),
    };
  } catch (err) {
    return {
      rawText: '',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Tool-use invoke — agent loop with function calling
// ---------------------------------------------------------------------------

export async function invokeLDAIConfigWithTools(
  opts: LDToolUseOptions,
): Promise<LDToolUseResult> {
  const start = performance.now();
  const maxIterations = opts.maxIterations ?? 10;
  const toolCalls: LDToolUseResult['toolCalls'] = [];

  try {
    const ai = await ensureLD();
    const openai = ensureOpenAI();

    const context = { kind: opts.contextKind, key: opts.contextKey };

    const aiConfig: LDAICompletionConfig = await ai.completionConfig(
      opts.aiConfigKey,
      context,
      { enabled: false },
      opts.variables,
    );

    if (!aiConfig.enabled) {
      return {
        rawText: '',
        latencyMs: Math.round(performance.now() - start),
        error: `AI Config "${opts.aiConfigKey}" is disabled or unavailable (fallback returned)`,
        iterations: 0,
        toolCalls,
      };
    }

    const modelName = aiConfig.model?.name ?? 'gpt-4';
    const params = aiConfig.model?.parameters ?? {};

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] =
      (aiConfig.messages ?? []).map(m => ({
        role: m.role,
        content: m.content,
      }));

    messages.push({ role: 'user', content: opts.userMessage });

    const tools: OpenAI.Chat.ChatCompletionTool[] = opts.tools.map(t => ({
      type: 'function' as const,
      function: t.function,
    }));

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalModel: string | undefined;
    let iterations = 0;
    let consecutiveRepeats = 0;
    let lastCallSignature = '';

    while (iterations < maxIterations) {
      iterations++;

      const callOpenAI = () =>
        openai.chat.completions.create({
          model: modelName,
          messages,
          tools,
          ...(params.temperature != null && { temperature: Number(params.temperature) }),
          ...(params.maxTokens != null && { max_tokens: Number(params.maxTokens) }),
          ...(consecutiveRepeats >= 2 && { tool_choice: 'none' as const }),
        });

      const completion = aiConfig.tracker
        ? await aiConfig.tracker.trackOpenAIMetrics(callOpenAI)
        : await callOpenAI();

      finalModel = completion.model;
      if (completion.usage) {
        totalInputTokens += completion.usage.prompt_tokens ?? 0;
        totalOutputTokens += completion.usage.completion_tokens ?? 0;
      }

      const choice = completion.choices[0];
      if (!choice) break;

      if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
        messages.push(choice.message);

        const callSignature = choice.message.tool_calls
          .filter(tc => tc.type === 'function')
          .map(tc => `${tc.function.name}:${tc.function.arguments}`)
          .join('|');

        if (callSignature === lastCallSignature) {
          consecutiveRepeats++;
        } else {
          consecutiveRepeats = 0;
          lastCallSignature = callSignature;
        }

        for (const tc of choice.message.tool_calls) {
          if (tc.type !== 'function') continue;
          const fnName = tc.function.name;
          let fnArgs: Record<string, unknown> = {};
          try {
            fnArgs = JSON.parse(tc.function.arguments);
          } catch {
            fnArgs = {};
          }

          const toolResult = await opts.executeToolCall(fnName, fnArgs);
          toolCalls.push({ name: fnName, args: fnArgs, result: toolResult.data });

          const resultPayload = toolResult.error
            ? { error: toolResult.error, _hint: 'This tool is unavailable. Do NOT retry — respond with what you know.' }
            : toolResult.data;

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(resultPayload ?? 'no result'),
          });
        }

        continue;
      }

      const rawText = choice.message?.content ?? '';
      return {
        rawText,
        latencyMs: Math.round(performance.now() - start),
        model: finalModel,
        tokens: {
          input: totalInputTokens,
          output: totalOutputTokens,
          total: totalInputTokens + totalOutputTokens,
        },
        iterations,
        toolCalls,
      };
    }

    return {
      rawText: '',
      latencyMs: Math.round(performance.now() - start),
      model: finalModel,
      error: `Tool-use loop exceeded max iterations (${maxIterations})`,
      tokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
        total: totalInputTokens + totalOutputTokens,
      },
      iterations,
      toolCalls,
    };
  } catch (err) {
    return {
      rawText: '',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
      iterations: 0,
      toolCalls,
    };
  }
}
