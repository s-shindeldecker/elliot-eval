import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatasetRow, Stage } from './types.js';

// ---------------------------------------------------------------------------
// Load + validate a JSONL dataset file
// ---------------------------------------------------------------------------

export function loadDataset(filePath: string, stage: Stage): DatasetRow[] {
  const abs = resolve(filePath);
  const raw = readFileSync(abs, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim().length > 0);

  const rows: DatasetRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]) as Record<string, unknown>;
      const row = validateRow(parsed, i + 1);
      rows.push(row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Line ${i + 1}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    console.error(`[loader] ${errors.length} row(s) failed validation:`);
    for (const e of errors) console.error(`  ${e}`);
  }

  if (rows.length === 0) {
    throw new Error(`No valid rows loaded from ${filePath}`);
  }

  const filtered = filterByStage(rows, stage);
  if (filtered.length === 0) {
    throw new Error(`No rows matched stage "${stage}" in ${filePath}`);
  }

  console.error(`[loader] Loaded ${filtered.length} rows for stage "${stage}" from ${filePath}`);
  return filtered;
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

function validateRow(obj: Record<string, unknown>, lineNum: number): DatasetRow {
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw new Error(`missing or empty "id"`);
  }
  if (typeof obj.input_text !== 'string' || obj.input_text.length === 0) {
    throw new Error(`missing or empty "input_text" (id=${obj.id ?? 'unknown'})`);
  }
  if (obj.expected == null || typeof obj.expected !== 'object') {
    throw new Error(`missing or invalid "expected" (id=${obj.id})`);
  }

  const expected = obj.expected as Record<string, unknown>;
  if (typeof expected.create_eic !== 'boolean') {
    throw new Error(`"expected.create_eic" must be boolean (id=${obj.id}, line=${lineNum})`);
  }

  const tags = Array.isArray(obj.tags)
    ? (obj.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : undefined;

  return {
    id: obj.id as string,
    input_text: obj.input_text as string,
    expected: obj.expected as DatasetRow['expected'],
    tags,
  };
}

// ---------------------------------------------------------------------------
// Stage filtering: screening = rows tagged "screening" (or first 3 if untagged)
// ---------------------------------------------------------------------------

function filterByStage(rows: DatasetRow[], stage: Stage): DatasetRow[] {
  if (stage === 'screening') {
    const tagged = rows.filter(r => r.tags?.includes('screening'));
    return tagged.length > 0 ? tagged : rows.slice(0, 3);
  }
  return rows;
}
