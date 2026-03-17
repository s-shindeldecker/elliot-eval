/**
 * Builds an evaluator-ready JSONL dataset from Scout v0 sample inputs.
 *
 * Pipeline: SalesforceOpportunityInput -> Scout v0 -> validateBundle -> renderPacket -> DatasetRow
 *
 * Run: npm run build:scout:v0:dataset
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScoutV0, type SalesforceOpportunityInput } from '../src/scout/scout-v0.js';
import { validateBundle } from '../src/curator/validate-bundle.js';
import { renderPacket } from '../src/curator/render-packet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplesPath = join(__dirname, '..', 'data', 'scout-v0.samples.json');
const outputPath = join(__dirname, '..', 'data', 'scout-v0.dataset.jsonl');

interface ExpectedOutput {
  create_eic: boolean;
  eic?: Record<string, unknown>;
}

const EXPECTED: Record<string, ExpectedOutput> = {
  'scout-sample-001': {
    create_eic: true,
    eic: {
      status: 'Active',
      stage_bucket: 'Late',
      motion: 'Net-new',
      primary_influence_tag: 'competitive_displacement',
      secondary_tag: 'platform_consolidation',
      ai_configs_adjacent: 'Unknown',
      competitive_mention: 'Yes',
      exec_sponsor_mentioned: 'Yes',
      experimentation_team_engaged: 'Unknown',
      influence_strength_range: [4, 5],
      impact_priority_range: [4, 4],
      confidence_allowed: ['High'],
    },
  },
  'scout-sample-002': { create_eic: false },
  'scout-sample-003': { create_eic: false },
};

const samples: SalesforceOpportunityInput[] = JSON.parse(readFileSync(samplesPath, 'utf-8'));

const lines: string[] = [];
let trueCount = 0;
let falseCount = 0;

for (const input of samples) {
  const bundle = runScoutV0(input);

  const validation = validateBundle(bundle);
  if (!validation.ok) {
    for (const e of validation.errors) console.error(`[${bundle.id}] ERROR: ${e}`);
  }
  for (const w of validation.warnings) console.error(`[${bundle.id}] WARN:  ${w}`);

  const inputText = renderPacket(bundle);

  const expected = EXPECTED[input.id];
  if (expected === undefined) {
    console.error(`[${input.id}] No expected output mapping — defaulting to create_eic=false`);
  }
  const exp: ExpectedOutput = expected ?? { create_eic: false };

  const row = {
    id: bundle.id,
    input_text: inputText,
    expected: exp,
    tags: ['gold'],
  };

  lines.push(JSON.stringify(row));

  if (exp.create_eic) trueCount++;
  else falseCount++;
}

writeFileSync(outputPath, lines.join('\n') + '\n', 'utf-8');

console.log(`Bundles processed: ${samples.length}`);
console.log(`Output:            ${outputPath}`);
console.log(`Expected CREATE:   ${trueCount}`);
console.log(`Expected NO_ACTION:${falseCount}`);
