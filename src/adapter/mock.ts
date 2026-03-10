import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AgentAdapter, AdapterInput, AdapterOutput } from './types.js';

interface MockResponseEntry {
  id: string;
  response?: Record<string, unknown>;
  rawText?: string;
}

// ---------------------------------------------------------------------------
// Mock adapter — reads canned responses from a JSONL file
// ---------------------------------------------------------------------------

export class MockAdapter implements AgentAdapter {
  readonly name: string;
  private readonly responses: Map<string, MockResponseEntry>;

  constructor(name: string, config: Record<string, unknown>) {
    this.name = name;

    const responsesPath = config['responsesPath'];
    if (typeof responsesPath !== 'string') {
      throw new Error(
        `MockAdapter "${name}": config.responsesPath must be a string pointing to a JSONL file`,
      );
    }

    this.responses = loadResponses(resolve(responsesPath));
  }

  async invoke(input: AdapterInput): Promise<AdapterOutput> {
    const start = performance.now();

    const entry = this.responses.get(input.caseId);
    if (!entry) {
      const latencyMs = Math.round(performance.now() - start);
      return {
        rawText: '',
        latencyMs,
        error: `MockAdapter "${this.name}": no canned response for caseId="${input.caseId}"`,
      };
    }

    // rawText passthrough: return the string verbatim (for testing parse failures)
    // response object: wrap in LLM-like fenced JSON output
    const rawText = entry.rawText ?? formatAsLlmOutput(entry.response!);
    const latencyMs = Math.round(performance.now() - start);

    return { rawText, latencyMs };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadResponses(filePath: string): Map<string, MockResponseEntry> {
  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim().length > 0);
  const map = new Map<string, MockResponseEntry>();

  for (const line of lines) {
    const parsed = JSON.parse(line) as MockResponseEntry;
    if (!parsed.id) {
      throw new Error(`Mock response missing "id" in ${filePath}`);
    }
    if (parsed.rawText == null && parsed.response == null) {
      throw new Error(`Mock response "${parsed.id}" must have either "response" or "rawText" in ${filePath}`);
    }
    map.set(parsed.id, parsed);
  }

  return map;
}

function formatAsLlmOutput(response: Record<string, unknown>): string {
  return [
    'Based on my analysis of the provided information, here is my evaluation:',
    '',
    '```json',
    JSON.stringify(response, null, 2),
    '```',
  ].join('\n');
}
