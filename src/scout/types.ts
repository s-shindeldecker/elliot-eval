/**
 * Core interfaces for the multi-agent Scout system.
 *
 * Each data source (Salesforce, Gong, Slack, etc.) has its own ScoutAgent
 * managed by an LD AI Config. Agents produce ScoutContributions which the
 * ScoutOrchestrator merges into a unified SignalBundle for the Curator.
 */

import type { SignalBundle, OpportunitySnapshot, EvidenceItem } from '../types/signal-bundle.js';

// ---------------------------------------------------------------------------
// ScoutTool — abstraction for data source operations
// ---------------------------------------------------------------------------

export interface ScoutToolResult {
  data: unknown;
  source_link?: string;
  error?: string;
}

export interface ScoutTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<ScoutToolResult>;
}

// ---------------------------------------------------------------------------
// ScoutContribution — what each Scout agent returns
// ---------------------------------------------------------------------------

export interface ScoutContributionMetadata {
  agent_config_key: string;
  model?: string;
  latency_ms: number;
  tokens?: { input: number; output: number };
}

export interface ScoutContribution {
  source: string;
  opportunity_id: string;
  snapshot_fields: Partial<OpportunitySnapshot>;
  evidence: EvidenceItem[];
  notes: string[];
  metadata: ScoutContributionMetadata;
}

// ---------------------------------------------------------------------------
// ScoutContext — input provided by the orchestrator to each agent
// ---------------------------------------------------------------------------

export interface ScoutContext {
  opportunity_id: string;
  account_name?: string;
  opportunity_name?: string;
  hints?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// ScoutAgent — per-source agent interface
// ---------------------------------------------------------------------------

export interface ScoutAgent {
  readonly source: string;
  readonly aiConfigKey: string;
  readonly tools: readonly ScoutTool[];
  scout(context: ScoutContext): Promise<ScoutContribution>;
}

// ---------------------------------------------------------------------------
// MergeStrategy — combines contributions into a SignalBundle
// ---------------------------------------------------------------------------

export interface MergeStrategy {
  merge(contributions: ScoutContribution[]): SignalBundle;
}

// ---------------------------------------------------------------------------
// ScoutOrchestrator — triggers agents and merges results
// ---------------------------------------------------------------------------

export interface ScoutOrchestrator {
  register(agent: ScoutAgent): void;
  scout(context: ScoutContext): Promise<SignalBundle>;
}
