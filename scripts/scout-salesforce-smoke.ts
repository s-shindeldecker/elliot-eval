/**
 * Salesforce Scout v1 smoke test.
 *
 * Loads a fixture, maps to SignalBundle, validates, and renders.
 *
 * Run: npm run test:scout:salesforce
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOpportunityFromFixture } from '../src/scout/salesforce/fetch-opportunity.js';
import { mapSalesforceRecordToBundle } from '../src/scout/salesforce/map-record-to-bundle.js';
import { validateBundle } from '../src/curator/validate-bundle.js';
import { renderPacket } from '../src/curator/render-packet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'data', 'salesforce-opportunity.sample.json');

async function main() {
  const record = await fetchOpportunityFromFixture(fixturePath);

  console.log('='.repeat(65));
  console.log('  Salesforce Scout v1 — Smoke Test');
  console.log('='.repeat(65));

  console.log('\n--- Raw Record Summary ---');
  console.log(`  ID:          ${record.id}`);
  console.log(`  Account:     ${record.accountName}`);
  console.log(`  Opportunity: ${record.opportunityName}`);
  console.log(`  Stage:       ${record.stageName}`);
  console.log(`  Owner:       ${record.ownerName ?? '(none)'}`);
  console.log(`  Close Date:  ${record.closeDate ?? '(none)'}`);
  console.log(`  Competitor:  ${record.competitor ?? '(none)'}`);
  console.log(`  Exec Sponsor:${record.execSponsor ?? '(none)'}`);
  console.log(`  Notes:       ${record.notes?.length ?? 0} entries`);
  console.log(`  Custom:      ${record.customFields ? Object.keys(record.customFields).join(', ') : '(none)'}`);

  const bundle = mapSalesforceRecordToBundle(record);

  console.log('\n--- Bundle ---');
  console.log(`  ID:          ${bundle.id}`);
  console.log(`  Title:       ${bundle.title}`);
  console.log(`  Evidence:    ${bundle.evidence.length} item(s)`);
  console.log(`  Notes:       ${bundle.notes?.length ?? 0} line(s)`);

  const validation = validateBundle(bundle);

  if (validation.ok) {
    console.log(`  Validation:  OK`);
  } else {
    console.log(`  Validation:  FAILED`);
    for (const e of validation.errors) console.log(`    ERROR: ${e}`);
  }
  for (const w of validation.warnings) console.log(`    WARN:  ${w}`);

  console.log('\n--- Rendered Packet ---');
  console.log(renderPacket(bundle));
  console.log('--- End Packet ---');

  console.log('\n' + '='.repeat(65));
  console.log(validation.ok ? '  PASS' : '  FAIL — see errors above');
  console.log('='.repeat(65));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
