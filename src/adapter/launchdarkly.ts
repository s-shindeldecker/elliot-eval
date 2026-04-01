import type { AgentAdapter, AdapterInput, AdapterOutput } from './types.js';
import { invokeLDAIConfig } from './ld-client.js';

// ---------------------------------------------------------------------------
// LaunchDarkly AI Config adapter
//
// Reads model configuration and prompt template from a LaunchDarkly AI Config,
// calls the model via OpenAI, and returns the raw text for downstream validation.
//
// Config fields (all optional, env-var fallbacks shown):
//   aiConfigKey  → LD_AI_CONFIG_KEY
//   contextKey   → LD_CONTEXT_KEY   (default "elliot-eval")
//   contextKind  → LD_CONTEXT_KIND  (default "user")
// ---------------------------------------------------------------------------

export class LaunchDarklyAdapter implements AgentAdapter {
  readonly name: string;
  private readonly aiConfigKey: string;
  private readonly contextKey: string;
  private readonly contextKind: string;
  private readonly jsonMode: boolean;

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.aiConfigKey =
      (config['aiConfigKey'] as string) ?? process.env.LD_AI_CONFIG_KEY ?? '';
    this.contextKey =
      (config['contextKey'] as string) ?? process.env.LD_CONTEXT_KEY ?? 'elliot-eval';
    this.contextKind =
      (config['contextKind'] as string) ?? process.env.LD_CONTEXT_KIND ?? 'user';
    this.jsonMode = (config['jsonMode'] as boolean) ?? true;

    if (!this.aiConfigKey) {
      console.error(
        `[LaunchDarklyAdapter "${name}"] WARNING: no aiConfigKey in config and LD_AI_CONFIG_KEY not set. ` +
          'Invocations will fail with ADAPTER_ERROR.',
      );
    }
  }

  async invoke(input: AdapterInput): Promise<AdapterOutput> {
    if (!this.aiConfigKey) {
      return {
        rawText: '',
        latencyMs: 0,
        error:
          `LaunchDarklyAdapter "${this.name}": aiConfigKey not configured ` +
          '(set in agent config or LD_AI_CONFIG_KEY env var)',
      };
    }

    const result = await invokeLDAIConfig({
      aiConfigKey: this.aiConfigKey,
      contextKind: this.contextKind,
      contextKey: this.contextKey,
      variables: { input_text: input.inputText },
      jsonMode: this.jsonMode,
    });

    if (result.error) {
      return {
        rawText: result.rawText,
        latencyMs: result.latencyMs,
        error: `LaunchDarklyAdapter "${this.name}": ${result.error}`,
      };
    }

    return { rawText: result.rawText, latencyMs: result.latencyMs };
  }
}
