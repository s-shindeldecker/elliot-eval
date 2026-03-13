/**
 * Curator → Judge end-to-end packet evaluation.
 *
 * Loads SignalBundle fixtures, renders them through the Curator,
 * validates mock Judge responses against the v2 schema, and checks
 * expected outcomes (action, classification, confidence, warnings,
 * hallucination).
 *
 * Run: npm run test:curator-judge-e2e
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { SignalBundle } from '../src/types/signal-bundle.js';
import { renderPacket } from '../src/curator/render-packet.js';
import { validateBundle } from '../src/curator/validate-bundle.js';
import { extractAndValidate, checkHumanSummaryDuplicates } from '../src/validator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestCaseExpected {
  action: string;
  impact_classification?: string;
  confidence_allowed?: string[];
  expected_warnings?: string[];
  hallucination_must_be_zero: boolean;
  schema_valid?: boolean;
  notes?: string;
}

interface TestCase {
  id: string;
  theme: string;
  category: 'gold' | 'adversarial';
  bundle: SignalBundle;
  mock_response: Record<string, unknown>;
  expected: TestCaseExpected;
}

interface CaseResult {
  id: string;
  theme: string;
  category: string;
  pass: boolean;
  failures: string[];
  warnings: string[];
  bundle_errors: string[];
  bundle_warnings: string[];
  notes?: string;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

function loadCases(dir: string): TestCase[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  } catch {
    console.warn(`  Warning: directory not found: ${dir}`);
    return [];
  }
  return files.map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as TestCase);
}

// ---------------------------------------------------------------------------
// Hallucination checker — evidence URLs must appear in rendered input_text
// ---------------------------------------------------------------------------

function checkHallucination(inputText: string, response: Record<string, unknown>): string[] {
  const failures: string[] = [];
  const json = response['json'] as Record<string, unknown> | undefined;
  if (!json) return failures;
  const eic = json['eic'] as Record<string, unknown> | null;
  if (!eic) return failures;
  const evidence = eic['evidence'] as Array<Record<string, unknown>> | undefined;
  if (!evidence) return failures;

  for (const ref of evidence) {
    const url = ref['url'] as string;
    if (url && !inputText.includes(url)) {
      failures.push(`HALLUCINATED_CITATION: "${url}" not found in rendered input_text`);
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const goldDir = join(ROOT, 'fixtures', 'curator-packets', 'gold');
const advDir = join(ROOT, 'fixtures', 'curator-packets', 'adversarial');

const goldCases = loadCases(goldDir);
const advCases = loadCases(advDir);
const allCases = [...goldCases, ...advCases];

console.log(`\nCurator -> Judge E2E Tests`);
console.log(`Loaded ${goldCases.length} gold + ${advCases.length} adversarial = ${allCases.length} total\n`);

const results: CaseResult[] = [];
let passed = 0;
let failed = 0;

for (const tc of allCases) {
  const failures: string[] = [];

  // --- Curator phase: validate bundle & render input_text ---
  const bundleVal = validateBundle(tc.bundle);
  const inputText = renderPacket(tc.bundle);

  // --- Judge phase: validate mock response through v2 schema ---
  const rawJson = JSON.stringify(tc.mock_response);
  const extraction = extractAndValidate(rawJson);

  const expectSchemaValid = tc.expected.schema_valid !== false;

  if (expectSchemaValid && !extraction.ok) {
    failures.push(
      `schema_validation_failed: ${extraction.failures.map(f => `${f.code}: ${f.detail}`).join(' | ')}`,
    );
  }
  if (!expectSchemaValid && extraction.ok) {
    failures.push('expected_schema_to_fail_but_passed');
  }

  // --- Check action ---
  if (extraction.ok && extraction.response) {
    const actualAction = extraction.response.json.action;
    if (actualAction !== tc.expected.action) {
      failures.push(`action: expected=${tc.expected.action} got=${actualAction}`);
    }

    // --- Check impact_classification ---
    if (tc.expected.impact_classification && extraction.response.json.eic) {
      const actual = extraction.response.json.eic.impact_classification;
      if (actual !== tc.expected.impact_classification) {
        failures.push(`classification: expected=${tc.expected.impact_classification} got=${actual}`);
      }
    }

    // --- Check confidence ---
    if (tc.expected.confidence_allowed && tc.expected.confidence_allowed.length > 0 && extraction.response.json.eic) {
      const actual = extraction.response.json.eic.confidence;
      if (!tc.expected.confidence_allowed.includes(actual)) {
        failures.push(`confidence: expected one of [${tc.expected.confidence_allowed.join(', ')}] got=${actual}`);
      }
    }

    // --- Check human_summary duplicates ---
    const dupWarnings = checkHumanSummaryDuplicates(extraction.response.human_summary);
    if (dupWarnings.length > 0) {
      // Not a hard failure, just note them
    }
  }

  // --- Hallucination check ---
  if (tc.expected.hallucination_must_be_zero) {
    failures.push(...checkHallucination(inputText, tc.mock_response));
  }

  // --- Expected warnings check ---
  const allWarnings = [...extraction.warnings];
  if (tc.expected.expected_warnings && tc.expected.expected_warnings.length > 0) {
    for (const expectedWarning of tc.expected.expected_warnings) {
      const found = allWarnings.some(w => w.includes(expectedWarning));
      if (!found) {
        failures.push(`missing_expected_warning: "${expectedWarning}"`);
      }
    }
  }

  const pass = failures.length === 0;
  if (pass) passed++;
  else failed++;

  const icon = pass ? '\u2713' : '\u2717';
  console.log(`  ${icon} [${tc.category.padEnd(11)}] ${tc.id}: ${tc.theme}`);

  if (!pass) {
    for (const f of failures) {
      console.log(`      \u2514\u2500 ${f}`);
    }
  }
  if (allWarnings.length > 0) {
    console.log(`      warnings: [${allWarnings.join(', ')}]`);
  }
  if (!bundleVal.ok) {
    console.log(`      bundle_errors: [${bundleVal.errors.join(', ')}]`);
  }
  if (bundleVal.warnings.length > 0) {
    console.log(`      bundle_warnings: [${bundleVal.warnings.join(', ')}]`);
  }

  results.push({
    id: tc.id,
    theme: tc.theme,
    category: tc.category,
    pass,
    failures,
    warnings: allWarnings,
    bundle_errors: bundleVal.errors,
    bundle_warnings: bundleVal.warnings,
    notes: tc.expected.notes,
  });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(65)}`);
console.log(`  ${passed} passed, ${failed} failed out of ${allCases.length} total`);
console.log('='.repeat(65));

const ambiguous = results.filter(r => r.notes);
if (ambiguous.length > 0) {
  console.log('\nAmbiguous outcomes (manual review recommended):');
  for (const a of ambiguous) {
    console.log(`  ${a.id}: ${a.notes}`);
  }
}

const withBundleErrors = results.filter(r => r.bundle_errors.length > 0);
if (withBundleErrors.length > 0) {
  console.log('\nBundle validation issues:');
  for (const r of withBundleErrors) {
    console.log(`  ${r.id}: ${r.bundle_errors.join(', ')}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
