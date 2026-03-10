import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Stage } from './types.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const AgentConfigSchema = z.object({
  name: z.string().min(1),
  adapter: z.enum(['mock', 'launchdarkly']),
  config: z.record(z.unknown()),
});

const ConfigFileSchema = z.object({
  agents: z.array(AgentConfigSchema).min(1),
  dataset: z.string().optional(),
  stage: z.enum(['screening', 'gold']).optional(),
  threshold: z.number().min(0).max(1).optional(),
  maxConcurrency: z.number().int().min(1).max(20).optional(),
  seed: z.number().int().optional(),
  failFast: z.boolean().optional(),
  timeoutMs: z.number().int().min(1).optional(),
});

export const EvalConfigSchema = z.object({
  agents: z.array(AgentConfigSchema).min(1),
  dataset: z.string().min(1),
  stage: z.enum(['screening', 'gold']),
  reportDir: z.string().min(1),
  threshold: z.number().min(0).max(1),
  maxConcurrency: z.number().int().min(1).max(20),
  seed: z.number().int(),
  failFast: z.boolean(),
  timeoutMs: z.number().int().min(1),
});

export type EvalConfig = z.infer<typeof EvalConfigSchema>;
export type AgentConfig = z.infer<typeof EvalConfigSchema>['agents'][number];

// ---------------------------------------------------------------------------
// Defaults (guardrail 15)
// ---------------------------------------------------------------------------

const DEFAULTS = {
  stage: 'screening' as Stage,
  threshold: 0.85,
  maxConcurrency: 2,
  seed: 42,
  failFast: false,
  timeoutMs: 30_000,
} as const;

// ---------------------------------------------------------------------------
// Resolve config from CLI opts + optional config file
// ---------------------------------------------------------------------------

export interface CliOpts {
  config?: string;
  dataset?: string;
  stage?: string;
  reportDir?: string;
  maxConcurrency?: string;
  threshold?: string;
  seed?: string;
  failFast?: boolean;
  agents?: string;
  timeoutMs?: string;
}

export function resolveConfig(cli: CliOpts): EvalConfig {
  let fileConfig: z.infer<typeof ConfigFileSchema> | undefined;

  if (cli.config) {
    const configPath = resolve(cli.config);
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    fileConfig = ConfigFileSchema.parse(parsed);
  }

  const now = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultReportDir = `./out/${now}`;

  const merged = {
    agents: fileConfig?.agents ?? [],
    dataset: cli.dataset ?? fileConfig?.dataset ?? '',
    stage: (cli.stage as Stage) ?? fileConfig?.stage ?? DEFAULTS.stage,
    reportDir: cli.reportDir ?? defaultReportDir,
    threshold: cli.threshold != null ? parseFloat(cli.threshold) : (fileConfig?.threshold ?? DEFAULTS.threshold),
    maxConcurrency: cli.maxConcurrency != null ? parseInt(cli.maxConcurrency, 10) : (fileConfig?.maxConcurrency ?? DEFAULTS.maxConcurrency),
    seed: cli.seed != null ? parseInt(cli.seed, 10) : (fileConfig?.seed ?? DEFAULTS.seed),
    failFast: cli.failFast ?? fileConfig?.failFast ?? DEFAULTS.failFast,
    timeoutMs: cli.timeoutMs != null ? parseInt(cli.timeoutMs, 10) : (fileConfig?.timeoutMs ?? DEFAULTS.timeoutMs),
  };

  if (cli.agents && fileConfig) {
    const allowed = new Set(cli.agents.split(',').map(s => s.trim()));
    merged.agents = fileConfig.agents.filter(a => allowed.has(a.name));
  }

  return EvalConfigSchema.parse(merged);
}
