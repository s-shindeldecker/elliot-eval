import type {
  AgentResponse,
  Confidence,
  DatasetRow,
  EICFields,
  EvalResult,
  ExpectedEic,
  FailureCode,
} from './types.js';
import type { ExtractionResult } from './validator.js';

interface Failure {
  code: FailureCode;
  detail: string;
}

// ---------------------------------------------------------------------------
// Score a single (agent × case) pair
// ---------------------------------------------------------------------------

export function scoreCase(
  row: DatasetRow,
  extraction: ExtractionResult,
  agentName: string,
  latencyMs: number,
  rawTextLength: number,
  rawTextSnippet: string,
): EvalResult {
  const failures: Failure[] = [];
  const timestamp = new Date().toISOString();

  // If extraction failed, record those failures and stop (guardrail 11: no silent passes)
  if (!extraction.ok || !extraction.response) {
    for (const f of extraction.failures) {
      failures.push(f);
    }
    return buildResult(row.id, agentName, failures, latencyMs, rawTextLength, rawTextSnippet, extraction.parsed_json_present, timestamp);
  }

  const response = extraction.response;

  // Guard: expected must define create_eic (guardrail 11)
  if (typeof row.expected.create_eic !== 'boolean') {
    failures.push({
      code: 'CONFIG_ERROR',
      detail: 'expected.create_eic is not defined — cannot score this case',
    });
    return buildResult(row.id, agentName, failures, latencyMs, rawTextLength, rawTextSnippet, true, timestamp);
  }

  // Check 1: decision match — only create_eic uses DECISION_MISMATCH
  if (response.json.create_eic !== row.expected.create_eic) {
    failures.push({
      code: 'DECISION_MISMATCH',
      detail: `create_eic: expected=${row.expected.create_eic}, got=${response.json.create_eic}`,
    });
  }

  // Check 2: MISSING_REQUIRED_FIELD — agent self-contradiction only.
  // Fires when the AGENT output has create_eic=true but eic=null.
  // Must NOT depend on expected.create_eic (that path is DECISION_MISMATCH).
  if (response.json.create_eic === true && response.json.eic == null) {
    failures.push({
      code: 'MISSING_REQUIRED_FIELD',
      detail: 'Agent output has create_eic=true but eic is null',
    });
  }

  // Check 3: EIC field scoring — only when agent provided an eic AND expected has scoring fields
  if (row.expected.create_eic && row.expected.eic && response.json.eic != null) {
    scoreEicFields(row.expected.eic, response.json.eic, failures);
  }

  // Check 3b: CONFIG_ERROR if create_eic=true but no expected.eic to score against
  if (row.expected.create_eic && !row.expected.eic) {
    failures.push({
      code: 'CONFIG_ERROR',
      detail: 'expected.create_eic=true but expected.eic is missing — nothing to score',
    });
  }

  // Check 4: hallucination gate — always run when eic is present
  if (response.json.eic != null) {
    checkHallucination(row.input_text, response.json.eic, failures);
  }

  return buildResult(row.id, agentName, failures, latencyMs, rawTextLength, rawTextSnippet, true, timestamp);
}

// ---------------------------------------------------------------------------
// EIC field-level scoring
// ---------------------------------------------------------------------------

const EXACT_MATCH_FIELDS = [
  'status',
  'primary_influence_tag',
  'secondary_tag',
  'ai_configs_adjacent',
  'competitive_mention',
  'exec_sponsor_mentioned',
  'experimentation_team_engaged',
  'stage_bucket',
  'motion',
] as const;

function scoreEicFields(
  expected: ExpectedEic,
  actual: EICFields,
  failures: Failure[],
): void {
  // --- Exact-match checks → FIELD_MISMATCH ---
  for (const field of EXACT_MATCH_FIELDS) {
    if (expected[field] !== undefined) {
      const expectedVal = expected[field];
      const actualVal = actual[field];
      if (actualVal !== expectedVal) {
        failures.push({
          code: 'FIELD_MISMATCH',
          detail: `${field}: expected=${JSON.stringify(expectedVal)}, got=${JSON.stringify(actualVal)}`,
        });
      }
    }
  }

  // --- Range checks → RANGE_VIOLATION ---
  if (expected.influence_strength_range != null) {
    const [min, max] = expected.influence_strength_range;
    if (actual.influence_strength < min || actual.influence_strength > max) {
      failures.push({
        code: 'RANGE_VIOLATION',
        detail: `influence_strength: expected [${min}..${max}], got=${actual.influence_strength}`,
      });
    }
  }

  if (expected.impact_priority_range != null) {
    const [min, max] = expected.impact_priority_range;
    if (actual.impact_priority < min || actual.impact_priority > max) {
      failures.push({
        code: 'RANGE_VIOLATION',
        detail: `impact_priority: expected [${min}..${max}], got=${actual.impact_priority}`,
      });
    }
  }

  if (expected.confidence_allowed != null) {
    if (!expected.confidence_allowed.includes(actual.confidence as Confidence)) {
      failures.push({
        code: 'RANGE_VIOLATION',
        detail: `confidence: expected one of [${expected.confidence_allowed.join(', ')}], got="${actual.confidence}"`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Hallucination check: citation URLs must appear verbatim in input_text
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s"'<>)\]},]+/g;

function checkHallucination(
  inputText: string,
  eic: EICFields,
  failures: Failure[],
): void {
  const citationFields = [eic.evidence_citation_1, eic.evidence_citation_2];

  for (const citation of citationFields) {
    if (citation == null || citation.length === 0) continue;

    const urls = citation.match(URL_REGEX);
    if (!urls) continue;

    for (const url of urls) {
      if (!inputText.includes(url)) {
        failures.push({
          code: 'HALLUCINATED_CITATION',
          detail: `URL "${url}" not found verbatim in input_text`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Build result
// ---------------------------------------------------------------------------

function buildResult(
  caseId: string,
  agentName: string,
  failures: Failure[],
  latencyMs: number,
  rawTextLength: number,
  rawTextSnippet: string,
  parsedJsonPresent: boolean,
  timestamp: string,
): EvalResult {
  const totalChecks = Math.max(failures.length + 1, 1);
  const failCount = failures.length;
  const score = failCount === 0 ? 1.0 : Math.max(0, 1 - failCount / totalChecks);

  return {
    caseId,
    agentName,
    pass: failures.length === 0,
    disqualified: false,
    failure_reasons: [...new Set(failures.map(f => f.code))],
    failure_details: failures.map(f => f.detail),
    score,
    latencyMs,
    rawTextLength,
    rawTextSnippet,
    parsed_json_present: parsedJsonPresent,
    timestamp,
  };
}

// ---------------------------------------------------------------------------
// LLM-as-judge stub (guardrail 5 — interface only, not implemented in v0.1)
// ---------------------------------------------------------------------------

export interface LlmJudge {
  evaluate(row: DatasetRow, response: AgentResponse): Promise<{
    score: number;
    reasoning: string;
  }>;
}

export class LlmJudgeStub implements LlmJudge {
  async evaluate(_row: DatasetRow, _response: AgentResponse): Promise<{
    score: number;
    reasoning: string;
  }> {
    throw new Error('LLM-as-judge is not implemented in v0.1. This is a stub interface only.');
  }
}
