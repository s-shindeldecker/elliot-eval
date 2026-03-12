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
