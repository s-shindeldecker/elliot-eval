import type { AgentAdapter, AdapterInput, AdapterOutput } from './types.js';

// ---------------------------------------------------------------------------
// LaunchDarkly AI Config adapter — STUB for v0.1
//
// Wiring points:
//   1. Set env vars: LD_SDK_KEY, LD_AI_CONFIG_KEY
//   2. Install @launchdarkly/node-server-sdk + @launchdarkly/server-sdk-ai
//   3. Replace the invoke() body with actual SDK calls
// ---------------------------------------------------------------------------

const REQUIRED_ENV = ['LD_SDK_KEY', 'LD_AI_CONFIG_KEY'] as const;

export class LaunchDarklyAdapter implements AgentAdapter {
  readonly name: string;
  private readonly configKey: string;

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;
    this.configKey = (config['configKey'] as string) ?? '';

    // Validate env vars exist but do NOT read real credentials
    const missing = REQUIRED_ENV.filter(k => !process.env[k]);
    if (missing.length > 0) {
      console.error(
        `[LaunchDarklyAdapter "${name}"] WARNING: missing env vars: ${missing.join(', ')}. ` +
          'Invocations will fail with ADAPTER_ERROR until these are set.',
      );
    }
  }

  async invoke(_input: AdapterInput): Promise<AdapterOutput> {
    const start = performance.now();

    // Guard: fail clearly if env vars are not set
    const missing = REQUIRED_ENV.filter(k => !process.env[k]);
    if (missing.length > 0) {
      return {
        rawText: '',
        latencyMs: Math.round(performance.now() - start),
        error:
          `LaunchDarklyAdapter "${this.name}" is a stub. ` +
          `Set env vars [${missing.join(', ')}] and implement SDK integration. ` +
          `AI Config key: "${this.configKey}"`,
      };
    }

    // TODO: Wire LaunchDarkly AI SDK here
    //
    // Implementation steps:
    //   1. Initialize LD client (cache across invocations or pass in)
    //   2. Retrieve AI config variation using this.configKey
    //   3. Call the model provider using the config (model, prompt template, etc.)
    //   4. Return the raw text response
    //
    // Example (pseudo-code):
    //   const client = ld.init(process.env.LD_SDK_KEY);
    //   await client.waitForInitialization();
    //   const aiConfig = client.variation(this.configKey, context, defaultValue);
    //   const completion = await callModel(aiConfig, input.inputText);
    //   return { rawText: completion.text, latencyMs: ... };

    return {
      rawText: '',
      latencyMs: Math.round(performance.now() - start),
      error:
        `LaunchDarklyAdapter "${this.name}": SDK integration not yet implemented. ` +
        'This is a v0.1 stub. See src/adapter/launchdarkly.ts for wiring instructions.',
    };
  }
}
