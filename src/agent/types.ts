/**
 * Types for the ELLIOT AI Config Agent.
 *
 * The agent receives a user query, uses tools to gather intelligence,
 * and produces a scored assessment.
 */

export interface AgentRequest {
  /** Raw user message (e.g., from Slack) */
  message: string;
  /** Optional user identifier for LD context */
  userId?: string;
  /** Optional channel/thread metadata */
  channel?: string;
  threadId?: string;
}

export interface AgentResult {
  /** The agent's natural-language response to the user */
  response: string;
  /** Structured scoring if a full pipeline run was executed */
  scoring?: AgentScoring;
  /** The rendered Curator packet (input_text sent to Judge), for replay testing */
  curatorPacket?: string;
  /** Metadata about the agent run */
  metadata: AgentMetadata;
}

export interface AgentScoring {
  action: string;
  confidence?: number;
  summary?: string[];
  rawJudgeOutput?: string;
}

export interface AgentMetadata {
  model?: string;
  latencyMs: number;
  iterations: number;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  tokens?: { input: number; output: number; total: number };
  error?: string;
}

export interface ElliotAgentConfig {
  /** LD AI Config key for the Scout agent's system prompt and model */
  aiConfigKey: string;
  /** LD AI Config key for the Judge model (if omitted, Judge stage is skipped) */
  judgeAiConfigKey?: string;
  /** LD context kind (default "user") */
  contextKind?: string;
  /** LD context key (default "elliot-agent") */
  contextKey?: string;
  /** Max tool-call iterations (default 10) */
  maxIterations?: number;
}
