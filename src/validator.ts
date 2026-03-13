import AjvModule from 'ajv';
import { agentResponseSchema } from './schemas/agent-response.js';
import { normalizeAgentResponse } from './normalize.js';
import type { AgentResponse, FailureCode, ImpactClassification, Confidence } from './types.js';

// ---------------------------------------------------------------------------
// AJV instance (singleton — immutable after compilation, guardrail 13)
// ---------------------------------------------------------------------------

const Ajv = ('default' in AjvModule ? AjvModule.default : AjvModule) as typeof AjvModule.default;
const ajv = new Ajv({ allErrors: true, verbose: true });
const validateResponse = ajv.compile(agentResponseSchema);

// ---------------------------------------------------------------------------
// Confidence × Classification constraints (Goal 5)
// ---------------------------------------------------------------------------

const CLASSIFICATION_CONFIDENCE_RULES: Record<ImpactClassification, Set<Confidence>> = {
  CONFIRMED:    new Set(['Medium', 'High']),
  PROBABLE:     new Set(['Low', 'Medium', 'High']),
  HYPOTHESIZED: new Set(['Low', 'Medium']),
  NO_IMPACT:    new Set(['Medium', 'High']),
};

// ---------------------------------------------------------------------------
// JSON extraction from raw LLM text
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  ok: boolean;
  parsed_json_present: boolean;
  response?: AgentResponse;
  failures: { code: FailureCode; detail: string }[];
  warnings: string[];
}

export function extractAndValidate(rawText: string): ExtractionResult {
  // Phase 1: JSON extraction + parse
  const jsonStr = extractJson(rawText);
  if (jsonStr == null) {
    return {
      ok: false,
      parsed_json_present: false,
      failures: [{
        code: 'JSON_PARSE_ERROR',
        detail: 'Could not locate JSON object in agent response',
      }],
      warnings: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      parsed_json_present: false,
      failures: [{
        code: 'JSON_PARSE_ERROR',
        detail: `JSON.parse failed: ${msg}`,
      }],
      warnings: [],
    };
  }

  // Phase 1.5: Normalize v1 → v2 before schema validation
  const { normalized, warnings: normWarnings } = normalizeAgentResponse(parsed);

  // Phase 2: AJV schema validation (only reached when JSON.parse succeeded)
  const valid = validateResponse(normalized);
  if (!valid) {
    const failures: ExtractionResult['failures'] = [];
    let hasConditionalError = false;

    for (const err of validateResponse.errors ?? []) {
      failures.push({
        code: 'SCHEMA_INVALID',
        detail: `${err.instancePath || '/'}: ${err.message ?? 'unknown error'} (keyword: ${err.keyword})`,
      });
      if (err.keyword === 'if' || (err.message && err.message.includes('must match "then" schema'))) {
        hasConditionalError = true;
      }
    }

    if (hasConditionalError) {
      failures.push({
        code: 'SCHEMA_INVALID',
        detail: 'Conditional schema failed: when json.action is CREATE or UPDATE, json.eic must be a full object; when NO_ACTION, json.eic must be null.',
      });
    }

    return { ok: false, parsed_json_present: true, failures, warnings: [...normWarnings] };
  }

  const response = normalized as unknown as AgentResponse;
  const warnings: string[] = [...normWarnings];

  // Phase 3: Soft validations (warnings, not hard failures)
  validateClassificationConfidence(response, warnings);
  validateHumanSummaryGrounding(response, warnings);
  validateEvidenceIdRefs(response, warnings);

  return { ok: true, parsed_json_present: true, response, failures: [], warnings };
}

// ---------------------------------------------------------------------------
// Soft validators (emit warnings)
// ---------------------------------------------------------------------------

function validateClassificationConfidence(response: AgentResponse, warnings: string[]): void {
  const eic = response.json.eic;
  if (eic == null) return;

  const classification = eic.impact_classification;
  const confidence = eic.confidence;
  const allowed = CLASSIFICATION_CONFIDENCE_RULES[classification];

  if (allowed && !allowed.has(confidence)) {
    warnings.push(
      `classification_confidence_mismatch: ${classification} expects confidence in [${[...allowed].join(', ')}], got ${confidence}`,
    );
  }
}

function validateHumanSummaryGrounding(response: AgentResponse, warnings: string[]): void {
  if (!response.rationale) return;

  const allRefs = new Set(
    response.rationale.because.flatMap(c => c.evidence_refs),
  );
  if (allRefs.size === 0) {
    warnings.push('human_summary_grounding: rationale.because has no evidence_refs');
  }
}

function validateEvidenceIdRefs(response: AgentResponse, warnings: string[]): void {
  const eic = response.json.eic;
  if (eic == null || !response.rationale) return;

  const knownIds = new Set(eic.evidence.map(e => e.evidence_id));

  for (const claim of response.rationale.because) {
    for (const ref of claim.evidence_refs) {
      if (!knownIds.has(ref)) {
        warnings.push(`dangling_evidence_ref: rationale references "${ref}" which is not in eic.evidence`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Human summary duplicate check
// ---------------------------------------------------------------------------

export function checkHumanSummaryDuplicates(summary: string[]): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const bullet of summary) {
    const key = bullet.toLowerCase().trim();
    if (seen.has(key)) {
      warnings.push(`duplicate_human_summary: "${bullet}"`);
    }
    seen.add(key);
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Try to extract a JSON object from raw text.
 * Strategy:
 *   1. Try parsing the entire text as JSON
 *   2. Look for ```json ... ``` fenced blocks
 *   3. Find the outermost { ... } pair
 */
function extractJson(text: string): string | null {
  const trimmed = text.trim();

  if (trimmed.startsWith('{')) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // fall through
    }
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    try {
      JSON.parse(inner);
      return inner;
    } catch {
      // fall through
    }
  }

  const start = trimmed.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
