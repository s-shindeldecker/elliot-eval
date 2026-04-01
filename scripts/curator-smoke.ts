import type { SignalBundle } from '../src/types/signal-bundle.js';
import { renderPacket } from '../src/curator/render-packet.js';
import { validateBundle } from '../src/curator/validate-bundle.js';

// ---------------------------------------------------------------------------
// Bundle 1: Full positive with competitive + exec sponsor details
// ---------------------------------------------------------------------------

const bundle1: SignalBundle = {
  id: 'smoke-001',
  title: 'Smoke 1 — Platform Consolidation with Competitive Displacement',
  snapshot: {
    eic_id: null,
    account: 'Northwind Retail',
    opportunity: 'Northwind - Platform Consolidation FY26',
    opportunity_link: 'https://salesforce/oppty/smoke-001',
    stage: '4 - EB Approval',
    stage_bucket: 'Late',
    motion: 'Net-new',
    ae_owner: 'Alex Rivera',
    experimentation_team_engaged: 'Yes',
    ai_configs_adjacent: 'No',
    competitive_mention: 'Yes',
    competitive_detail: 'Statsig',
    exec_sponsor_mentioned: 'Yes',
    exec_sponsor_detail: 'VP Digital',
    next_checkpoint: '2026-04-15',
  },
  evidence: [
    {
      source_type: 'Gong',
      source_id: 'smoke-abc',
      source_link: 'https://gong/call/smoke-abc',
      timestamp: '00:18:42',
      snippet: 'We\'re choosing between you and Statsig. The deciding factor is experimentation.',
    },
    {
      source_type: 'Slack',
      source_id: 'smoke-slack-1',
      source_link: 'https://slack/thread/northwind',
      snippet: 'AE: "They want experimentation built-in, not bolted on."',
    },
  ],
  notes: ['Close window: <30 days', 'AE dispute: None'],
};

// ---------------------------------------------------------------------------
// Bundle 2: Negative control (no EIC expected, minimal fields)
// ---------------------------------------------------------------------------

const bundle2: SignalBundle = {
  id: 'smoke-002',
  title: 'Smoke 2 — Negative Control (No Experimentation Signal)',
  snapshot: {
    account: 'Tailspin Toys',
    opportunity: 'Tailspin - Net-new Starter',
    opportunity_link: 'https://salesforce/oppty/smoke-002',
    stage: '1 - Validate Fit',
    stage_bucket: 'Early',
    motion: 'Net-new',
    ae_owner: 'Morgan Chen',
    experimentation_team_engaged: 'No',
    ai_configs_adjacent: 'No',
    competitive_mention: 'No',
    exec_sponsor_mentioned: 'No',
  },
  evidence: [
    {
      source_type: 'Gong',
      source_id: 'smoke-ghi',
      source_link: 'https://gong/call/smoke-ghi',
      timestamp: '00:09:20',
      snippet: 'Our main goal is feature flagging for stability. No experiments.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Bundle 3: Invalid bundle to test validation errors + warnings
// ---------------------------------------------------------------------------

const bundle3: SignalBundle = {
  id: '',
  title: '',
  snapshot: {
    account: '',
    opportunity: 'Some Opportunity',
    next_checkpoint: 'not-a-date',
  },
  evidence: [
    { source_type: '', source_id: 'bad-1', source_link: 'https://example.com/a', snippet: 'ok' },
    { source_type: 'Gong', source_id: 'bad-1', source_link: 'https://example.com/b', snippet: '' },
  ],
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const bundles = [
  { name: 'Bundle 1 (full positive)', bundle: bundle1 },
  { name: 'Bundle 2 (negative control)', bundle: bundle2 },
  { name: 'Bundle 3 (invalid)', bundle: bundle3 },
];

let allPassed = true;

for (const { name, bundle } of bundles) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(60));

  const validation = validateBundle(bundle);
  console.log(`\n  Validation: ${validation.ok ? 'OK' : 'FAILED'}`);
  if (validation.errors.length > 0) {
    console.log('  Errors:');
    for (const e of validation.errors) console.log(`    - ${e}`);
  }
  if (validation.warnings.length > 0) {
    console.log('  Warnings:');
    for (const w of validation.warnings) console.log(`    - ${w}`);
  }

  const rendered = renderPacket(bundle);
  console.log('\n--- Rendered packet ---');
  console.log(rendered);
  console.log('--- End packet ---');

  // Assertion: evidence source_id and source_link (when present) must appear in rendered output
  for (const ev of bundle.evidence) {
    if (ev.source_id && !rendered.includes(ev.source_id)) {
      console.error(`  FAIL: evidence source_id "${ev.source_id}" not found in rendered output`);
      allPassed = false;
    }
    if (ev.source_link && !rendered.includes(ev.source_link)) {
      console.error(`  FAIL: evidence source_link "${ev.source_link}" not found in rendered output`);
      allPassed = false;
    }
  }
}

// Bundle-specific assertions
const v1 = validateBundle(bundle1);
const v3 = validateBundle(bundle3);

if (!v1.ok) { console.error('FAIL: bundle1 should be valid'); allPassed = false; }
if (v3.ok) { console.error('FAIL: bundle3 should be invalid'); allPassed = false; }
if (v3.errors.length < 3) { console.error(`FAIL: bundle3 should have >=3 errors, got ${v3.errors.length}`); allPassed = false; }
if (v3.warnings.length < 2) { console.error(`FAIL: bundle3 should have >=2 warnings, got ${v3.warnings.length}`); allPassed = false; }

const r1 = renderPacket(bundle1);
if (!r1.includes('Competitive Mention?: Yes (Statsig)')) { console.error('FAIL: missing competitive detail'); allPassed = false; }
if (!r1.includes('Exec Sponsor Mentioned?: Yes (VP Digital)')) { console.error('FAIL: missing exec detail'); allPassed = false; }
if (!r1.includes('Source ID: smoke-abc')) { console.error('FAIL: evidence source_id missing from render'); allPassed = false; }
if (!r1.includes('https://gong/call/smoke-abc')) { console.error('FAIL: evidence source_link missing from render'); allPassed = false; }

console.log(`\n${'='.repeat(60)}`);
console.log(allPassed ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED');
console.log('='.repeat(60));
process.exit(allPassed ? 0 : 1);
