/**
 * Scout v0 smoke test.
 *
 * Loads sample Salesforce inputs, runs them through Scout v0,
 * validates the resulting bundles, and renders packets.
 *
 * Run: npm run test:scout:v0
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScoutV0, type SalesforceOpportunityInput } from '../src/scout/scout-v0.js';
import { validateBundle } from '../src/curator/validate-bundle.js';
import { renderPacket } from '../src/curator/render-packet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplesPath = join(__dirname, '..', 'data', 'scout-v0.samples.json');
const samples: SalesforceOpportunityInput[] = JSON.parse(readFileSync(samplesPath, 'utf-8'));

const LABELS = ['Positive / competitive', 'Ambiguous / weak signal', 'Negative control'];

let hasErrors = false;

for (let i = 0; i < samples.length; i++) {
  const input = samples[i];
  const label = LABELS[i] ?? `Sample ${i + 1}`;

  console.log(`\n${'='.repeat(65)}`);
  console.log(`  ${label}: ${input.account} — ${input.opportunity}`);
  console.log('='.repeat(65));

  const bundle = runScoutV0(input);

  console.log(`\n  Bundle ID:    ${bundle.id}`);
  console.log(`  Bundle Title: ${bundle.title}`);
  console.log(`  Evidence:     ${bundle.evidence.length} item(s)`);
  console.log(`  Notes:        ${bundle.notes?.length ?? 0} line(s)`);

  const validation = validateBundle(bundle);

  if (validation.ok) {
    console.log(`  Validation:   OK`);
  } else {
    console.log(`  Validation:   FAILED`);
    for (const e of validation.errors) console.log(`    ERROR: ${e}`);
    hasErrors = true;
  }
  if (validation.warnings.length > 0) {
    for (const w of validation.warnings) console.log(`    WARN:  ${w}`);
  }

  console.log(`\n--- Rendered Packet ---`);
  console.log(renderPacket(bundle));
  console.log(`--- End Packet ---`);
}

console.log(`\n${'='.repeat(65)}`);
if (hasErrors) {
  console.log('  SOME BUNDLES HAD VALIDATION ERRORS — review above');
} else {
  console.log('  ALL BUNDLES VALID');
}
console.log('='.repeat(65));
