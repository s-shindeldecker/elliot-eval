import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FAILURE_CODES,
  HARD_FAIL_CODES,
  type AgentSummary,
  type EvalResult,
  type FailureCode,
  type Stage,
} from './types.js';

// ---------------------------------------------------------------------------
// Reporter — streaming results.jsonl + summary.csv + console
// ---------------------------------------------------------------------------

export class Reporter {
  private readonly dir: string;
  private readonly resultsPath: string;
  private readonly summaryPath: string;
  private initialized = false;

  constructor(reportDir: string) {
    this.dir = reportDir;
    this.resultsPath = join(reportDir, 'results.jsonl');
    this.summaryPath = join(reportDir, 'summary.csv');
  }

  private ensureDir(): void {
    if (!this.initialized) {
      mkdirSync(this.dir, { recursive: true });
      this.initialized = true;
    }
  }

  writeResult(result: EvalResult): void {
    this.ensureDir();
    appendFileSync(this.resultsPath, JSON.stringify(result) + '\n');
  }

  writeSummary(summaries: AgentSummary[]): void {
    this.ensureDir();
    const headers = [
      'agent',
      'stage',
      'total',
      'passed',
      'failed',
      'disqualified_count',
      'hard_fail_count',
      'pass_rate',
      'meets_threshold',
      'avg_latency_ms',
      'p50_latency_ms',
      'p90_latency_ms',
      'parse_success_rate',
      ...FAILURE_CODES.map(c => `fail_${c}`),
    ];

    const rows = summaries.map(s => [
      csvEscape(s.agentName),
      s.stage,
      s.totalCases,
      s.passed,
      s.failed,
      s.disqualified_count,
      s.hard_fail_count,
      s.passRate.toFixed(4),
      s.meetsThreshold,
      s.avg_latency_ms.toFixed(1),
      s.p50_latency_ms.toFixed(1),
      s.p90_latency_ms.toFixed(1),
      s.parse_success_rate.toFixed(4),
      ...FAILURE_CODES.map(c => s.failureCounts[c] ?? 0),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n') + '\n';
    writeFileSync(this.summaryPath, csv);
  }

  printConsole(summaries: AgentSummary[]): void {
    console.error('\n=== Elliot Eval Summary ===\n');

    for (const s of summaries) {
      const status = s.meetsThreshold ? 'PASS' : 'FAIL';
      console.error(`  [${status}] ${s.agentName} (${s.stage})`);
      console.error(`    Cases: ${s.totalCases} | Passed: ${s.passed} | Failed: ${s.failed} | Disqualified: ${s.disqualified_count}`);
      console.error(`    Pass rate: ${(s.passRate * 100).toFixed(1)}%`);
      if (s.stage === 'gold') {
        console.error(`    Hard fails: ${s.hard_fail_count}`);
      }
      console.error(`    Latency: avg=${s.avg_latency_ms.toFixed(0)}ms  p50=${s.p50_latency_ms.toFixed(0)}ms  p90=${s.p90_latency_ms.toFixed(0)}ms`);
      console.error(`    Parse success: ${(s.parse_success_rate * 100).toFixed(1)}%`);

      const failEntries = Object.entries(s.failureCounts).filter(([, v]) => v != null && v > 0);
      if (failEntries.length > 0) {
        console.error(`    Failures: ${failEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
      console.error();
    }

    console.error(`  Report dir: ${this.dir}\n`);
  }
}

// ---------------------------------------------------------------------------
// Aggregate per-agent results into summaries
// ---------------------------------------------------------------------------

export function buildSummaries(
  results: EvalResult[],
  agentNames: string[],
  stage: Stage,
  threshold: number,
): AgentSummary[] {
  return agentNames.map(name => {
    const agentResults = results.filter(r => r.agentName === name);
    const latencies = agentResults.filter(r => !r.disqualified).map(r => r.latencyMs).sort((a, b) => a - b);
    const disqualifiedCount = agentResults.filter(r => r.disqualified).length;
    const scoredResults = agentResults.filter(r => !r.disqualified);
    const passed = scoredResults.filter(r => r.pass).length;
    const failed = scoredResults.filter(r => !r.pass).length;
    const total = agentResults.length;
    const parseSuccesses = scoredResults.filter(r => r.parsed_json_present).length;
    const scoredCount = scoredResults.length;

    const passRate = scoredCount > 0 ? passed / scoredCount : 0;

    const failureCounts: Partial<Record<FailureCode, number>> = {};
    for (const r of agentResults) {
      for (const code of r.failure_reasons) {
        failureCounts[code] = (failureCounts[code] ?? 0) + 1;
      }
    }

    const hardFailCount = scoredResults.filter(r =>
      r.failure_reasons.some(c => HARD_FAIL_CODES.has(c)),
    ).length;

    const meetsThreshold = stage === 'screening'
      ? failed === 0 && disqualifiedCount === 0
      : passRate >= threshold && disqualifiedCount === 0 && hardFailCount === 0;

    return {
      agentName: name,
      stage,
      totalCases: total,
      passed,
      failed,
      disqualified_count: disqualifiedCount,
      hard_fail_count: hardFailCount,
      passRate,
      meetsThreshold,
      avg_latency_ms: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      p50_latency_ms: percentile(latencies, 0.5),
      p90_latency_ms: percentile(latencies, 0.9),
      parse_success_rate: scoredCount > 0 ? parseSuccesses / scoredCount : 0,
      failureCounts,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
