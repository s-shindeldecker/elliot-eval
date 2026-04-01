import type {
  AgentResponse,
  Confidence,
  DatasetRow,
  EICFields,
  EvalResult,
  ExpectedEic,
  FailureCode,
  Action,
} from './types.js';
import type { ExtractionResult } from './validator.js';
import { checkHumanSummaryDuplicates } from './validator.js';
import { normalizeExpected } from './normalize.js';

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
  const warnings: string[] = [...(extraction.warnings ?? [])];
  const timestamp = new Date().toISOString();

  if (!extraction.ok || !extraction.response) {
    for (const f of extraction.failures) {
      failures.push(f);
    }
    return buildResult(row.id, agentName, failures, warnings, latencyMs, rawTextLength, rawTextSnippet, extraction.parsed_json_present, timestamp);
  }

  const response = extraction.response;

  normalizeExpected(row.expected);

  const expectedAction = resolveExpectedAction(row.expected);
  if (expectedAction == null) {
    failures.push({
      code: 'CONFIG_ERROR',
      detail: 'expected.create_eic/action is not defined — cannot score this case',
    });
    return buildResult(row.id, agentName, failures, warnings, latencyMs, rawTextLength, rawTextSnippet, true, timestamp);
  }

  // Check 1: decision match — action vs expected action
  if (response.json.action !== expectedAction) {
    failures.push({
      code: 'DECISION_MISMATCH',
      detail: `action: expected=${expectedAction}, got=${response.json.action}`,
    });
  }

  // Check 2: agent self-contradiction — action is CREATE/UPDATE but eic missing
  if ((response.json.action === 'CREATE' || response.json.action === 'UPDATE') && response.json.eic == null) {
    failures.push({
      code: 'MISSING_REQUIRED_FIELD',
      detail: `Agent output has action=${response.json.action} but eic is null`,
    });
  }

  // Check 3: EIC field scoring — only when expected says CREATE/UPDATE with scoring fields
  const expectsEic = expectedAction === 'CREATE' || expectedAction === 'UPDATE';
  if (expectsEic && row.expected.eic && response.json.eic != null) {
    scoreEicFields(row.expected.eic, response.json.eic, failures);
  }

  if (expectsEic && !row.expected.eic) {
    failures.push({
      code: 'CONFIG_ERROR',
      detail: `expected.action=${expectedAction} but expected.eic is missing — nothing to score`,
    });
  }

  // Check 4: hallucination gate — always run when eic is present
  if (response.json.eic != null) {
    checkHallucination(row.input_text, response.json.eic, failures);
  }

  // Soft checks (warnings only)
  warnings.push(...checkHumanSummaryDuplicates(response.human_summary));

  return buildResult(row.id, agentName, failures, warnings, latencyMs, rawTextLength, rawTextSnippet, true, timestamp);
}

// ---------------------------------------------------------------------------
// Resolve the expected action from either v2 action or v1 create_eic
// ---------------------------------------------------------------------------

function resolveExpectedAction(expected: DatasetRow['expected']): Action | null {
  if (expected.action != null) return expected.action;
  if (typeof expected.create_eic === 'boolean') {
    return expected.create_eic ? 'CREATE' : 'NO_ACTION';
  }
  return null;
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
  'impact_classification',
] as const;

function scoreEicFields(
  expected: ExpectedEic,
  actual: EICFields,
  failures: Failure[],
): void {
  for (const field of EXACT_MATCH_FIELDS) {
    // Use the _allowed set when present (e.g. primary_influence_tag_allowed)
    const allowedKey = `${field}_allowed` as keyof ExpectedEic;
    const allowedSet = expected[allowedKey] as string[] | undefined;
    if (Array.isArray(allowedSet)) {
      const actualVal = actual[field];
      if (!allowedSet.includes(actualVal as string)) {
        failures.push({
          code: 'FIELD_MISMATCH',
          detail: `${field}: expected one of [${allowedSet.join(', ')}], got=${JSON.stringify(actualVal)}`,
        });
      }
      continue;
    }

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

  // Range checks
  if (expected.influence_strength_range != null) {
    const [min, max] = expected.influence_strength_range;
    if (actual.influence_strength == null) {
      failures.push({
        code: 'RANGE_VIOLATION',
        detail: `influence_strength: expected [${min}..${max}], got=null`,
      });
    } else if (actual.influence_strength < min || actual.influence_strength > max) {
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
// Hallucination check: evidence URLs must appear verbatim in input_text
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s"'<>)\]},]+/g;

function checkHallucination(
  inputText: string,
  eic: EICFields,
  failures: Failure[],
): void {
  for (const ref of eic.evidence) {
    const urls = ref.url.match(URL_REGEX);
    if (!urls) continue;

    for (const url of urls) {
      if (!inputText.includes(url)) {
        failures.push({
          code: 'HALLUCINATED_CITATION',
          detail: `URL "${url}" (evidence_id="${ref.evidence_id}") not found verbatim in input_text`,
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
  warnings: string[],
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
    warnings,
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
