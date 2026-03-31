/**
 * Builds an evaluator-ready JSONL dataset from Salesforce fixture files.
 *
 * Pipeline: JSON fixtures -> fetchOpportunityFromFixture -> mapSalesforceRecordToBundle
 *           -> validateBundle -> renderPacket -> DatasetRow (with expected from expected.json)
 *
 * Run: npm run build:salesforce:dataset
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOpportunityFromFixture } from '../src/scout/salesforce/fetch-opportunity.js';
import { mapSalesforceRecordToBundle } from '../src/scout/salesforce/map-record-to-bundle.js';
import { validateBundle } from '../src/curator/validate-bundle.js';
import { renderPacket } from '../src/curator/render-packet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'data', 'salesforce-fixtures');
const expectedPath = join(fixturesDir, 'expected.json');
const outputPath = join(__dirname, '..', 'data', 'salesforce-v1.dataset.jsonl');

interface ExpectedOutput {
  action: 'CREATE' | 'UPDATE' | 'NO_ACTION';
  eic?: Record<string, unknown>;
}

const expectedMap: Record<string, ExpectedOutput> = JSON.parse(
  readFileSync(expectedPath, 'utf-8'),
);

const fixtureFiles = readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.json') && f !== 'expected.json')
  .sort();

if (fixtureFiles.length === 0) {
  console.error('No fixture JSON files found in', fixturesDir);
  process.exit(1);
}

const lines: string[] = [];
let createCount = 0;
let noActionCount = 0;
let errors = 0;

for (const file of fixtureFiles) {
  const path = join(fixturesDir, file);
  const record = await fetchOpportunityFromFixture(path);
  const bundle = mapSalesforceRecordToBundle(record);

  const validation = validateBundle(bundle);
  if (!validation.ok) {
    for (const e of validation.errors) console.error(`[${bundle.id}] ERROR: ${e}`);
    errors++;
  }
  for (const w of validation.warnings) console.warn(`[${bundle.id}] WARN:  ${w}`);

  const inputText = renderPacket(bundle);

  const expected = expectedMap[record.id];
  if (!expected) {
    console.error(`[${record.id}] No entry in expected.json — skipping`);
    errors++;
    continue;
  }

  const row: Record<string, unknown> = {
    id: bundle.id,
    input_text: inputText,
    expected: {
      action: expected.action,
      create_eic: expected.action === 'CREATE',
      ...(expected.eic ? { eic: expected.eic } : {}),
    },
    tags: ['gold'],
  };

  lines.push(JSON.stringify(row));

  if (expected.action === 'CREATE') createCount++;
  else noActionCount++;
}

writeFileSync(outputPath, lines.join('\n') + '\n', 'utf-8');

console.log('');
console.log(`Fixtures processed: ${fixtureFiles.length}`);
console.log(`Output:             ${outputPath}`);
console.log(`Expected CREATE:    ${createCount}`);
console.log(`Expected NO_ACTION: ${noActionCount}`);

if (errors > 0) {
  console.error(`\n${errors} error(s) — review output above`);
  process.exit(1);
}
