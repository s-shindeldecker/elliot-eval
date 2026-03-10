import type { EvalConfig, AgentConfig } from './config.js';
import type { DatasetRow, EvalResult } from './types.js';
import type { AgentAdapter, AdapterInput, AdapterOutput } from './adapter/types.js';
import { MockAdapter } from './adapter/mock.js';
import { LaunchDarklyAdapter } from './adapter/launchdarkly.js';
import { extractAndValidate } from './validator.js';
import { scoreCase } from './scorer.js';
import { Reporter, buildSummaries } from './reporter.js';
import { loadDataset } from './loader.js';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runEval(config: EvalConfig): Promise<{ exitCode: number }> {
  const reporter = new Reporter(config.reportDir);
  const adapters = config.agents.map(a => createAdapter(a));
  const allResults: EvalResult[] = [];

  if (config.stage === 'screening') {
    const rows = loadDataset(config.dataset, 'screening');
    await runStage(adapters, rows, config, reporter, allResults);
  } else {
    // Gold: run screening first, then gold for survivors
    const allRows = loadDataset(config.dataset, 'gold');
    const screeningRows = allRows.filter(r => r.tags?.includes('screening'));
    const goldRows = allRows.filter(r => !r.tags?.includes('screening'));

    const screeningResults: EvalResult[] = [];
    await runStage(adapters, screeningRows, config, reporter, screeningResults);
    allResults.push(...screeningResults);

    // Determine which agents passed screening
    const failedAgents = new Set<string>();
    for (const adapter of adapters) {
      const agentScreening = screeningResults.filter(r => r.agentName === adapter.name);
      if (agentScreening.some(r => !r.pass)) {
        failedAgents.add(adapter.name);
      }
    }

    // Run gold rows — disqualify agents that failed screening
    for (const adapter of adapters) {
      if (failedAgents.has(adapter.name)) {
        for (const row of goldRows) {
          const result = buildDisqualifiedResult(row.id, adapter.name);
          allResults.push(result);
          reporter.writeResult(result);
        }
        continue;
      }

      for (const row of goldRows) {
        const result = await runSingleCase(adapter, row, config);
        allResults.push(result);
        reporter.writeResult(result);
      }
    }
  }

  // Summaries + console
  const agentNames = adapters.map(a => a.name);
  const summaries = buildSummaries(allResults, agentNames, config.stage, config.threshold);
  reporter.writeSummary(summaries);
  reporter.printConsole(summaries);

  // Exit code (guardrail 16)
  const allPass = summaries.every(s => s.meetsThreshold);
  return { exitCode: allPass ? 0 : 1 };
}

// ---------------------------------------------------------------------------
// Run a set of cases against all adapters with concurrency + failFast
// ---------------------------------------------------------------------------

async function runStage(
  adapters: AgentAdapter[],
  rows: DatasetRow[],
  config: EvalConfig,
  reporter: Reporter,
  results: EvalResult[],
): Promise<void> {
  for (const adapter of adapters) {
    let aborted = false;

    const work = rows.map(row => async () => {
      if (aborted) return;
      const result = await runSingleCase(adapter, row, config);
      results.push(result);
      reporter.writeResult(result);

      if (!result.pass && config.failFast) {
        aborted = true;
      }
    });

    await runWithConcurrency(work, config.maxConcurrency);
  }
}

// ---------------------------------------------------------------------------
// Run a single (adapter × case) with timeout
// ---------------------------------------------------------------------------

async function runSingleCase(
  adapter: AgentAdapter,
  row: DatasetRow,
  config: EvalConfig,
): Promise<EvalResult> {
  const input: AdapterInput = { caseId: row.id, inputText: row.input_text };

  const output = await invokeWithTimeout(adapter, input, config.timeoutMs);

  // Adapter-level errors (ADAPTER_ERROR or TIMEOUT)
  if (output.error) {
    const code = output.error.includes('timed out') ? 'TIMEOUT' : 'ADAPTER_ERROR';
    return {
      caseId: row.id,
      agentName: adapter.name,
      pass: false,
      disqualified: false,
      failure_reasons: [code],
      failure_details: [output.error],
      score: 0,
      latencyMs: output.latencyMs,
      rawTextLength: output.rawText.length,
      parsed_json_present: false,
      timestamp: new Date().toISOString(),
    };
  }

  // Validate + score
  const extraction = extractAndValidate(output.rawText);
  return scoreCase(row, extraction, adapter.name, output.latencyMs, output.rawText.length);
}

// ---------------------------------------------------------------------------
// Adapter invocation with timeout
// ---------------------------------------------------------------------------

async function invokeWithTimeout(
  adapter: AgentAdapter,
  input: AdapterInput,
  timeoutMs: number,
): Promise<AdapterOutput> {
  const start = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      adapter.invoke(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
      }),
    ]);
  } catch (err) {
    if (err instanceof Error && err.message === 'TIMEOUT') {
      return {
        rawText: '',
        latencyMs: Math.round(performance.now() - start),
        error: `Adapter invocation timed out after ${timeoutMs}ms`,
      };
    }
    return {
      rawText: '',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Disqualified result for agents that failed screening
// ---------------------------------------------------------------------------

function buildDisqualifiedResult(caseId: string, agentName: string): EvalResult {
  return {
    caseId,
    agentName,
    pass: false,
    disqualified: true,
    failure_reasons: [],
    failure_details: ['Agent disqualified: failed screening stage'],
    score: 0,
    latencyMs: 0,
    rawTextLength: 0,
    parsed_json_present: false,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Bounded concurrency helper
// ---------------------------------------------------------------------------

async function runWithConcurrency(
  tasks: (() => Promise<void>)[],
  maxConcurrency: number,
): Promise<void> {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(maxConcurrency, tasks.length) },
    async () => {
      while (index < tasks.length) {
        const current = index++;
        await tasks[current]();
      }
    },
  );
  await Promise.all(workers);
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

function createAdapter(agentConfig: AgentConfig): AgentAdapter {
  switch (agentConfig.adapter) {
    case 'mock':
      return new MockAdapter(agentConfig.name, agentConfig.config);
    case 'launchdarkly':
      return new LaunchDarklyAdapter(agentConfig.name, agentConfig.config);
    default:
      throw new Error(`Unknown adapter type: ${agentConfig.adapter}`);
  }
}
