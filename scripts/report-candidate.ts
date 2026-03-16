/**
 * Candidate Evaluation Report Generator (v0.1)
 *
 * Reads existing evaluation outputs from out/ directories and produces
 * a structured candidate-eval.json. This is a read-only aggregation layer
 * that does not modify the evaluation pipeline.
 *
 * Usage:
 *   npx tsx scripts/report-candidate.ts --run out/<dir> --candidate <name> --model <name>
 *
 * If no --run is provided, uses the most recent directory under out/.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// CLI parsing (minimal, no dependencies)
// ---------------------------------------------------------------------------

interface CliArgs {
  runs: string[];
  outFile: string;
  candidate: string;
  model: string;
}

function parseCli(): CliArgs {
  const args = process.argv.slice(2);
  const runs: string[] = [];
  let outFile = 'out/candidate-eval.json';
  let candidate = 'unknown-candidate';
  let model = 'unknown-model';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--run':
        if (args[i + 1]) runs.push(args[++i]);
        break;
      case '--out':
        if (args[i + 1]) outFile = args[++i];
        break;
      case '--candidate':
        if (args[i + 1]) candidate = args[++i];
        break;
      case '--model':
        if (args[i + 1]) model = args[++i];
        break;
    }
  }

  if (runs.length === 0) {
    const outDir = resolve('out');
    if (existsSync(outDir)) {
      const dirs = readdirSync(outDir)
        .filter(d => statSync(join(outDir, d)).isDirectory())
        .filter(d => d !== '.' && d !== '..')
        .sort()
        .reverse();
      if (dirs.length > 0) {
        runs.push(join(outDir, dirs[0]));
        warn(`No --run specified; using most recent: ${runs[0]}`);
      }
    }
  }

  if (runs.length === 0) {
    warn('No run directories found. Output will have minimal data.');
  }

  return { runs, outFile, candidate, model };
}

// ---------------------------------------------------------------------------
// Types for parsed data
// ---------------------------------------------------------------------------

interface SummaryRow {
  agent: string;
  stage: string;
  total: number;
  passed: number;
  failed: number;
  disqualified_count: number;
  hard_fail_count: number;
  pass_rate: number;
  meets_threshold: boolean;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p90_latency_ms: number;
  parse_success_rate: number;
  fail_SCHEMA_INVALID: number;
  fail_JSON_PARSE_ERROR: number;
  fail_DECISION_MISMATCH: number;
  fail_FIELD_MISMATCH: number;
  fail_RANGE_VIOLATION: number;
  fail_HALLUCINATED_CITATION: number;
  fail_MISSING_REQUIRED_FIELD: number;
  fail_ADAPTER_ERROR: number;
  fail_TIMEOUT: number;
  fail_CONFIG_ERROR: number;
}

interface ResultRow {
  caseId: string;
  agentName: string;
  pass: boolean;
  disqualified: boolean;
  failure_reasons: string[];
  warnings: string[];
  latencyMs: number;
}

interface RunData {
  runPath: string;
  summaries: SummaryRow[];
  results: ResultRow[];
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseSummaryCsv(csvText: string): SummaryRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',');
  const rows: SummaryRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < headers.length) continue;

    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j];
    }

    rows.push({
      agent: obj['agent'] ?? '',
      stage: obj['stage'] ?? '',
      total: num(obj['total']),
      passed: num(obj['passed']),
      failed: num(obj['failed']),
      disqualified_count: num(obj['disqualified_count']),
      hard_fail_count: num(obj['hard_fail_count']),
      pass_rate: num(obj['pass_rate']),
      meets_threshold: obj['meets_threshold'] === 'true',
      avg_latency_ms: num(obj['avg_latency_ms']),
      p50_latency_ms: num(obj['p50_latency_ms']),
      p90_latency_ms: num(obj['p90_latency_ms']),
      parse_success_rate: num(obj['parse_success_rate']),
      fail_SCHEMA_INVALID: num(obj['fail_SCHEMA_INVALID']),
      fail_JSON_PARSE_ERROR: num(obj['fail_JSON_PARSE_ERROR']),
      fail_DECISION_MISMATCH: num(obj['fail_DECISION_MISMATCH']),
      fail_FIELD_MISMATCH: num(obj['fail_FIELD_MISMATCH']),
      fail_RANGE_VIOLATION: num(obj['fail_RANGE_VIOLATION']),
      fail_HALLUCINATED_CITATION: num(obj['fail_HALLUCINATED_CITATION']),
      fail_MISSING_REQUIRED_FIELD: num(obj['fail_MISSING_REQUIRED_FIELD']),
      fail_ADAPTER_ERROR: num(obj['fail_ADAPTER_ERROR']),
      fail_TIMEOUT: num(obj['fail_TIMEOUT']),
      fail_CONFIG_ERROR: num(obj['fail_CONFIG_ERROR']),
    });
  }

  return rows;
}

function parseResultsJsonl(text: string): ResultRow[] {
  const rows: ResultRow[] = [];
  for (const line of text.trim().split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      rows.push({
        caseId: obj.caseId ?? '',
        agentName: obj.agentName ?? '',
        pass: !!obj.pass,
        disqualified: !!obj.disqualified,
        failure_reasons: Array.isArray(obj.failure_reasons) ? obj.failure_reasons : [],
        warnings: Array.isArray(obj.warnings) ? obj.warnings : [],
        latencyMs: typeof obj.latencyMs === 'number' ? obj.latencyMs : 0,
      });
    } catch {
      warn(`Skipping unparseable results.jsonl line`);
    }
  }
  return rows;
}

function loadRun(runPath: string): RunData | null {
  const absPath = resolve(runPath);
  const summaryPath = join(absPath, 'summary.csv');
  const resultsPath = join(absPath, 'results.jsonl');

  if (!existsSync(summaryPath) && !existsSync(resultsPath)) {
    warn(`Skipping ${runPath}: neither summary.csv nor results.jsonl found`);
    return null;
  }

  let summaries: SummaryRow[] = [];
  let results: ResultRow[] = [];

  if (existsSync(summaryPath)) {
    summaries = parseSummaryCsv(readFileSync(summaryPath, 'utf-8'));
  } else {
    warn(`${runPath}: summary.csv missing, using results.jsonl only`);
  }

  if (existsSync(resultsPath)) {
    results = parseResultsJsonl(readFileSync(resultsPath, 'utf-8'));
  } else {
    warn(`${runPath}: results.jsonl missing, using summary.csv only`);
  }

  return { runPath: absPath, summaries, results };
}

// ---------------------------------------------------------------------------
// Stage classification
// ---------------------------------------------------------------------------

interface StageReport {
  present: boolean;
  pass: boolean | null;
  cases: number | null;
  pass_rate: number | null;
  hard_fails: number | null;
}

function emptyStage(): StageReport {
  return { present: false, pass: null, cases: null, pass_rate: null, hard_fails: null };
}

function classifyStage(runPath: string, stage: string): 'screening' | 'technical_judge' | 'holdout' {
  const lower = runPath.toLowerCase();
  if (stage === 'screening') return 'screening';
  if (lower.includes('holdout')) return 'holdout';
  return 'technical_judge';
}

function buildStageReport(rows: SummaryRow[]): StageReport {
  if (rows.length === 0) return emptyStage();

  const totalCases = rows.reduce((s, r) => s + r.total, 0);
  const totalPassed = rows.reduce((s, r) => s + r.passed, 0);
  const totalHardFails = rows.reduce((s, r) => s + r.hard_fail_count, 0);
  const allMeetThreshold = rows.every(r => r.meets_threshold);

  return {
    present: true,
    pass: allMeetThreshold,
    cases: totalCases,
    pass_rate: totalCases > 0 ? round(totalPassed / totalCases) : null,
    hard_fails: totalHardFails,
  };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const CRITICAL_CODES = new Set([
  'HALLUCINATED_CITATION',
  'SCHEMA_INVALID',
  'JSON_PARSE_ERROR',
  'ADAPTER_ERROR',
  'CONFIG_ERROR',
  'TIMEOUT',
]);

function computeMetrics(allResults: ResultRow[], allSummaries: SummaryRow[]) {
  const scored = allResults.filter(r => !r.disqualified);
  const totalCases = scored.length;

  if (totalCases === 0) {
    return {
      hallucination_rate: null,
      schema_failure_rate: null,
      evidence_survival_rate: null,
      cost_per_case: null,
      decision_accuracy: null,
      field_accuracy: null,
      warning_rate: null,
      avg_latency_ms: null,
      p90_latency_ms: null,
    };
  }

  const hallucinationCount = scored.filter(r =>
    r.failure_reasons.includes('HALLUCINATED_CITATION'),
  ).length;

  const schemaFailCount = scored.filter(r =>
    r.failure_reasons.includes('SCHEMA_INVALID') || r.failure_reasons.includes('JSON_PARSE_ERROR'),
  ).length;

  const passedCount = scored.filter(r => r.pass).length;

  // field_accuracy = 1 - (cases with FIELD_MISMATCH or RANGE_VIOLATION) / total
  // This counts cases, not individual field checks, so it's a conservative approximation.
  const fieldFailCount = scored.filter(r =>
    r.failure_reasons.includes('FIELD_MISMATCH') || r.failure_reasons.includes('RANGE_VIOLATION'),
  ).length;

  const warningCount = scored.reduce((s, r) => s + r.warnings.length, 0);

  const latencies = scored.map(r => r.latencyMs).sort((a, b) => a - b);
  const avgLatency = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  const p90Latency = percentile(latencies, 0.9);

  return {
    hallucination_rate: round(hallucinationCount / totalCases),
    schema_failure_rate: round(schemaFailCount / totalCases),
    evidence_survival_rate: null as number | null,  // requires Scout pipeline
    cost_per_case: null as number | null,            // requires token instrumentation
    decision_accuracy: round(passedCount / totalCases),
    field_accuracy: round(1 - fieldFailCount / totalCases),
    warning_rate: round(warningCount / totalCases),
    avg_latency_ms: round(avgLatency),
    p90_latency_ms: round(p90Latency),
  };
}

function computeJudgeScore(
  decisionAccuracy: number | null,
  hallucinationCount: number,
  schemaFailCount: number,
): number | null {
  if (decisionAccuracy == null) return null;

  let score = decisionAccuracy * 5.0;
  if (hallucinationCount > 0) score -= 1.0;
  if (schemaFailCount > 0) score -= 0.5;
  return round(Math.max(0, Math.min(5, score)));
}

// ---------------------------------------------------------------------------
// Report assembly
// ---------------------------------------------------------------------------

function buildReport(
  cli: CliArgs,
  runDataList: RunData[],
) {
  const allResults: ResultRow[] = [];
  const allSummaries: SummaryRow[] = [];

  const screeningSummaries: SummaryRow[] = [];
  const technicalSummaries: SummaryRow[] = [];
  const holdoutSummaries: SummaryRow[] = [];

  for (const run of runDataList) {
    allResults.push(...run.results);
    allSummaries.push(...run.summaries);

    for (const row of run.summaries) {
      const mapped = classifyStage(run.runPath, row.stage);
      switch (mapped) {
        case 'screening': screeningSummaries.push(row); break;
        case 'technical_judge': technicalSummaries.push(row); break;
        case 'holdout': holdoutSummaries.push(row); break;
      }
    }
  }

  const stages = {
    screening: buildStageReport(screeningSummaries),
    technical_judge: buildStageReport(technicalSummaries),
    stress: emptyStage(),
    holdout: buildStageReport(holdoutSummaries),
  };

  // Check if any run path suggests stress/adversarial
  for (const run of runDataList) {
    const lower = run.runPath.toLowerCase();
    if (lower.includes('stress') || lower.includes('adversarial')) {
      stages.stress.present = true;
    }
  }

  const metrics = computeMetrics(allResults, allSummaries);

  const scored = allResults.filter(r => !r.disqualified);
  const hallucinationCount = scored.filter(r =>
    r.failure_reasons.includes('HALLUCINATED_CITATION'),
  ).length;
  const schemaFailCount = scored.filter(r =>
    r.failure_reasons.includes('SCHEMA_INVALID') || r.failure_reasons.includes('JSON_PARSE_ERROR'),
  ).length;

  const judgeScore = computeJudgeScore(metrics.decision_accuracy, hallucinationCount, schemaFailCount);

  const criticalFailures = new Set<string>();
  for (const r of scored) {
    for (const code of r.failure_reasons) {
      if (CRITICAL_CODES.has(code)) criticalFailures.add(code);
    }
  }

  let hiringDecision: 'RECOMMEND' | 'NO_RECOMMEND' | 'INSUFFICIENT_DATA';
  if (!stages.technical_judge.present) {
    hiringDecision = 'INSUFFICIENT_DATA';
  } else if (
    metrics.decision_accuracy != null &&
    metrics.decision_accuracy >= 0.85 &&
    criticalFailures.size === 0
  ) {
    hiringDecision = 'RECOMMEND';
  } else {
    hiringDecision = 'NO_RECOMMEND';
  }

  return {
    candidate: cli.candidate,
    model: cli.model,
    timestamp: new Date().toISOString(),
    component_scores: {
      scout_score: null,
      curator_score: null,
      judge_score: judgeScore,
      scribe_score: null,
    },
    composite_score: null,
    metrics,
    stages,
    critical_failures: [...criticalFailures].sort(),
    hiring_decision: hiringDecision,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(s: string | undefined): number {
  if (s == null) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function warn(msg: string): void {
  console.error(`[report-candidate] ${msg}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const cli = parseCli();
const runDataList: RunData[] = [];

for (const runPath of cli.runs) {
  const data = loadRun(runPath);
  if (data) runDataList.push(data);
}

const report = buildReport(cli, runDataList);

const outPath = resolve(cli.outFile);
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.error(`[report-candidate] Wrote ${outPath}`);
console.log(JSON.stringify(report, null, 2));
