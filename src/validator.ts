import AjvModule from 'ajv';
import { agentResponseSchema } from './schemas/agent-response.js';
import type { AgentResponse, FailureCode } from './types.js';

// ---------------------------------------------------------------------------
// AJV instance (singleton — immutable after compilation, guardrail 13)
// ---------------------------------------------------------------------------

// AJV ships CJS default under .default in ESM context
const Ajv = ('default' in AjvModule ? AjvModule.default : AjvModule) as typeof AjvModule.default;
const ajv = new Ajv({ allErrors: true, verbose: true });
const validateResponse = ajv.compile(agentResponseSchema);

// ---------------------------------------------------------------------------
// JSON extraction from raw LLM text
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  ok: boolean;
  parsed_json_present: boolean;
  response?: AgentResponse;
  failures: { code: FailureCode; detail: string }[];
}

export function extractAndValidate(rawText: string): ExtractionResult {
  // Phase 1: JSON extraction + parse
  // On failure → JSON_PARSE_ERROR, parsed_json_present = false, skip AJV entirely
  const jsonStr = extractJson(rawText);
  if (jsonStr == null) {
    return {
      ok: false,
      parsed_json_present: false,
      failures: [{
        code: 'JSON_PARSE_ERROR',
        detail: 'Could not locate JSON object in agent response',
      }],
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
    };
  }

  // Phase 2: AJV schema validation (only reached when JSON.parse succeeded)
  // On failure → SCHEMA_INVALID, parsed_json_present = true
  const valid = validateResponse(parsed);
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
        detail: 'Conditional schema failed: when json.create_eic=true, json.eic must be a full object; when false, json.eic must be null.',
      });
    }

    return { ok: false, parsed_json_present: true, failures };
  }

  return { ok: true, parsed_json_present: true, response: parsed as AgentResponse, failures: [] };
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

  // Strategy 1: whole text is valid JSON
  if (trimmed.startsWith('{')) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // fall through
    }
  }

  // Strategy 2: fenced code block
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

  // Strategy 3: first balanced { ... }
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
