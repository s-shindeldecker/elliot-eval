/**
 * ElliotAgent — orchestrates the full Scout → Curator → Judge pipeline.
 *
 * 1. Scout: LLM agent (LD AI Config + tools) gathers raw intelligence
 * 2. Curator: deterministic code normalizes tool results into a SignalBundle
 * 3. Judge: separate LLM (LD AI Config, no tools) scores the curated bundle
 *
 * Judge is optional — if judgeAiConfigKey is not configured, only Scout runs.
 */

import type { ToolRegistry, ToolDefinition, ToolResult } from '../tools/types.js';
import {
  invokeLDAIConfig,
  invokeLDAIConfigWithTools,
  type LDToolUseResult,
} from '../adapter/ld-client.js';
import { curateToolResults } from '../curator/curate-tool-results.js';
import { validateBundle } from '../curator/validate-bundle.js';
import { renderPacket } from '../curator/render-packet.js';
import type {
  AgentRequest,
  AgentResult,
  AgentScoring,
  ElliotAgentConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export class ElliotAgent {
  private config: ElliotAgentConfig;
  private registries: ToolRegistry[];

  constructor(config: ElliotAgentConfig) {
    this.config = config;
    this.registries = [];
  }

  /** Register a tool set (Wisdom, Salesforce, pipeline tools, etc.) */
  registerTools(registry: ToolRegistry): void {
    this.registries.push(registry);
  }

  /** Run the full pipeline: Scout → Curator → Judge */
  async run(request: AgentRequest): Promise<AgentResult> {
    const startMs = performance.now();

    // ----- Scout -----
    const scoutResult = await this.runScout(request);

    const agentResult: AgentResult = {
      response: scoutResult.rawText || scoutResult.error || 'No response generated.',
      metadata: {
        model: scoutResult.model,
        latencyMs: scoutResult.latencyMs,
        iterations: scoutResult.iterations,
        toolCalls: scoutResult.toolCalls.map(tc => ({ name: tc.name, args: tc.args })),
        tokens: scoutResult.tokens,
        error: scoutResult.error,
      },
    };

    // ----- Curator + Judge (only if Judge is configured and Scout gathered intelligence) -----
    const INTELLIGENCE_TOOLS = new Set([
      'get_recent_calls', 'get_call_details', 'get_support_tickets',
      'get_account_feedback', 'get_slack_mentions',
    ]);
    const hasIntelligence = scoutResult.toolCalls.some(tc => INTELLIGENCE_TOOLS.has(tc.name));
    if (this.config.judgeAiConfigKey && hasIntelligence && !scoutResult.error) {
      try {
        const { scoring, curatorPacket } = await this.runCuratorAndJudge(
          request,
          scoutResult.toolCalls,
        );
        agentResult.scoring = scoring;
        agentResult.curatorPacket = curatorPacket;
        agentResult.metadata.latencyMs = Math.round(performance.now() - startMs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        agentResult.metadata.error = `Judge failed: ${msg}`;
      }
    }

    return agentResult;
  }

  // ---------------------------------------------------------------------------
  // Scout stage
  // ---------------------------------------------------------------------------

  private async runScout(request: AgentRequest): Promise<LDToolUseResult> {
    const allDefinitions: ToolDefinition[] = [];
    for (const reg of this.registries) {
      allDefinitions.push(...reg.definitions());
    }

    const executeToolCall = async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<ToolResult> => {
      for (const reg of this.registries) {
        const defs = reg.definitions();
        if (defs.some(d => d.function.name === name)) {
          return reg.execute(name, args);
        }
      }
      return { data: null, error: `Unknown tool: ${name}` };
    };

    return invokeLDAIConfigWithTools({
      aiConfigKey: this.config.aiConfigKey,
      contextKind: this.config.contextKind ?? 'user',
      contextKey: request.userId ?? this.config.contextKey ?? 'elliot-agent',
      variables: {},
      tools: allDefinitions,
      executeToolCall,
      userMessage: request.message,
      maxIterations: this.config.maxIterations ?? 10,
      priorMessages: request.conversationHistory,
    });
  }

  // ---------------------------------------------------------------------------
  // Curator + Judge stages
  // ---------------------------------------------------------------------------

  private async runCuratorAndJudge(
    request: AgentRequest,
    toolCalls: LDToolUseResult['toolCalls'],
  ): Promise<{ scoring: AgentScoring; curatorPacket: string }> {
    // Curator: deterministic transform → SignalBundle → input_text
    const accountName = this.inferAccountName(toolCalls);
    const bundle = curateToolResults(accountName, toolCalls);
    const validation = validateBundle(bundle);

    if (!validation.ok) {
      return {
        scoring: {
          action: 'NO_ACTION',
          summary: [`Curator validation failed: ${validation.errors.join('; ')}`],
        },
        curatorPacket: '',
      };
    }

    const inputText = renderPacket(bundle);

    // Judge: LLM scoring via separate AI Config
    const judgeResult = await invokeLDAIConfig({
      aiConfigKey: this.config.judgeAiConfigKey!,
      contextKind: this.config.contextKind ?? 'user',
      contextKey: request.userId ?? this.config.contextKey ?? 'elliot-agent',
      variables: { input_text: inputText },
      jsonMode: true,
    });

    if (judgeResult.error) {
      return {
        scoring: {
          action: 'NO_ACTION',
          summary: [`Judge error: ${judgeResult.error}`],
          rawJudgeOutput: judgeResult.rawText,
        },
        curatorPacket: inputText,
      };
    }

    return {
      scoring: parseJudgeOutput(judgeResult.rawText),
      curatorPacket: inputText,
    };
  }

  /** Best-effort extraction of account name from tool call args/results. */
  private inferAccountName(
    toolCalls: LDToolUseResult['toolCalls'],
  ): string {
    // Try search_account result first
    const searchCall = toolCalls.find(tc => tc.name === 'search_account');
    if (searchCall?.result) {
      const accounts = searchCall.result as Array<{ name?: string }>;
      if (Array.isArray(accounts) && accounts[0]?.name) {
        return accounts[0].name;
      }
    }

    // Fall back to args from any tool that has account_name
    for (const tc of toolCalls) {
      const name = tc.args.account_name ?? tc.args.query;
      if (typeof name === 'string' && name.length > 0) return name;
    }

    return 'Unknown Account';
  }
}

// ---------------------------------------------------------------------------
// Judge output parsing
// ---------------------------------------------------------------------------

function parseJudgeOutput(rawText: string): AgentScoring {
  try {
    const parsed = JSON.parse(rawText);

    const action = parsed?.json?.action ?? parsed?.action ?? 'NO_ACTION';
    const humanSummary: string[] = Array.isArray(parsed?.human_summary)
      ? parsed.human_summary
      : [];

    const confidence = extractConfidence(parsed);

    return {
      action,
      confidence,
      summary: humanSummary.length > 0 ? humanSummary : undefined,
      rawJudgeOutput: rawText,
    };
  } catch {
    return {
      action: 'NO_ACTION',
      summary: ['Judge returned unparseable output'],
      rawJudgeOutput: rawText,
    };
  }
}

function extractConfidence(parsed: Record<string, unknown>): number | undefined {
  const eic = (parsed?.json as Record<string, unknown>)?.eic as Record<string, unknown> | null;
  if (!eic) return undefined;

  const conf = eic.confidence;
  if (conf === 'High') return 0.9;
  if (conf === 'Medium') return 0.6;
  if (conf === 'Low') return 0.3;
  if (typeof conf === 'number') return conf;
  return undefined;
}
