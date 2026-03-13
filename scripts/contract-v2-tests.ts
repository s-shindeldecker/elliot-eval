/**
 * Unit tests for Decision Contract v2.
 *
 * Covers: normalizer, AJV schema, validator soft checks, scorer edge cases.
 * Run with: npx tsx scripts/contract-v2-tests.ts
 */

import AjvModule from 'ajv';
import { normalizeAgentResponse, normalizeExpected } from '../src/normalize.js';
import { extractAndValidate, checkHumanSummaryDuplicates } from '../src/validator.js';
import { agentResponseSchema } from '../src/schemas/agent-response.js';
import { InMemoryEicStore } from '../src/store/in-memory-eic-store.js';
import type { EICFields } from '../src/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function section(name: string): void {
  console.log(`\n--- ${name} ---`);
}

// ---------------------------------------------------------------------------
// Helper: build a minimal valid v2 EIC payload
// ---------------------------------------------------------------------------

function validEic(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eic_id: 'EIC-TEST-001',
    account: 'TestCo',
    opportunity: 'TestCo - Expansion',
    opportunity_link: null,
    stage: '3 - Proposal',
    stage_bucket: 'Mid',
    motion: 'Expansion',
    ae_owner: 'Tester',
    experimentation_team_engaged: 'Yes',
    influence_strength: 4,
    confidence: 'High',
    impact_classification: 'CONFIRMED',
    impact_priority: 4,
    primary_influence_tag: 'release_velocity',
    secondary_tag: 'deployment_pipeline',
    ai_configs_adjacent: 'Yes',
    competitive_mention: 'No',
    exec_sponsor_mentioned: 'No',
    summary_why_it_matters: 'Testing the contract.',
    evidence: [
      { evidence_id: 'ev-1', source_type: 'Gong', url: 'https://example.com/call1' },
    ],
    next_checkpoint: '2026-04-01',
    status: 'Active',
    ...overrides,
  };
}

function validPayload(overrides: Record<string, unknown> = {}, eicOverrides?: Record<string, unknown>): string {
  const payload: Record<string, unknown> = {
    human_summary: ['Test summary bullet one'],
    json: {
      action: 'CREATE',
      eic: validEic(eicOverrides ?? {}),
    },
    ...overrides,
  };
  return JSON.stringify(payload);
}

function noActionPayload(): string {
  return JSON.stringify({
    human_summary: ['No action needed'],
    json: { action: 'NO_ACTION', eic: null },
  });
}

// ===================================================================
// A) Evidence normalization
// ===================================================================

section('A) Evidence normalization');

{
  const old = {
    human_summary: ['test'],
    json: {
      create_eic: true,
      eic: {
        ...validEic({ evidence: undefined }),
        evidence_citation_1: 'https://example.com/a',
        evidence_citation_2: 'https://example.com/b',
      },
    },
  };
  // Remove the evidence field that validEic adds
  delete (old.json.eic as Record<string, unknown>)['evidence'];
  delete (old.json.eic as Record<string, unknown>)['impact_classification'];

  const { normalized, warnings } = normalizeAgentResponse(structuredClone(old));
  const n = normalized as Record<string, unknown>;
  const eic = (n['json'] as Record<string, unknown>)['eic'] as Record<string, unknown>;

  assert(Array.isArray(eic['evidence']), 'evidence_citation_1/2 maps to evidence[]');
  const ev = eic['evidence'] as Array<Record<string, unknown>>;
  assert(ev.length === 2, 'evidence array has 2 entries');
  assert(ev[0]['evidence_id'] === 'ev-legacy-1', 'first evidence_id is ev-legacy-1');
  assert(ev[1]['evidence_id'] === 'ev-legacy-2', 'second evidence_id is ev-legacy-2');
  assert(ev[0]['url'] === 'https://example.com/a', 'first URL preserved');
  assert(ev[1]['url'] === 'https://example.com/b', 'second URL preserved');
  assert(eic['evidence_citation_1'] === undefined, 'evidence_citation_1 deleted after migration');
  assert(eic['evidence_citation_2'] === undefined, 'evidence_citation_2 deleted after migration');

  // Evidence IDs are unique within the array
  const ids = ev.map(e => e['evidence_id']);
  assert(new Set(ids).size === ids.length, 'evidence_id values are unique');
}

{
  // Null evidence_citation_2 → only 1 entry
  const old = {
    human_summary: ['test'],
    json: {
      create_eic: true,
      eic: {
        ...validEic({ evidence: undefined }),
        evidence_citation_1: 'https://example.com/a',
        evidence_citation_2: null,
      },
    },
  };
  delete (old.json.eic as Record<string, unknown>)['evidence'];
  delete (old.json.eic as Record<string, unknown>)['impact_classification'];

  const { normalized } = normalizeAgentResponse(structuredClone(old));
  const eic = ((normalized as Record<string, unknown>)['json'] as Record<string, unknown>)['eic'] as Record<string, unknown>;
  const ev = eic['evidence'] as Array<Record<string, unknown>>;
  assert(ev.length === 1, 'null evidence_citation_2 produces 1-element evidence array');
}

// ===================================================================
// A.2) Evidence refs in rationale must reference evidence_id values
// ===================================================================

section('A.2) Rationale evidence_refs validation');

{
  const raw = validPayload({
    rationale: {
      because: [{ claim: 'test', evidence_refs: ['ev-MISSING'] }],
      assumptions: [],
      open_questions: [],
    },
  });
  const result = extractAndValidate(raw);
  assert(result.ok, 'dangling evidence_ref does not hard-fail');
  assert(
    result.warnings.some(w => w.includes('dangling_evidence_ref')),
    'dangling evidence_ref emits warning',
  );
}

{
  const raw = validPayload({
    rationale: {
      because: [{ claim: 'test', evidence_refs: ['ev-1'] }],
      assumptions: [],
      open_questions: [],
    },
  });
  const result = extractAndValidate(raw);
  assert(result.ok, 'valid evidence_ref passes');
  assert(
    !result.warnings.some(w => w.includes('dangling_evidence_ref')),
    'valid evidence_ref emits no dangling warning',
  );
}

// ===================================================================
// B) Action mapping
// ===================================================================

section('B) Action mapping');

{
  // create_eic=true → action=CREATE (no EIC- prefix)
  const old = {
    human_summary: ['test'],
    json: {
      create_eic: true,
      eic: validEic({ eic_id: 'NEW-001' }),
    },
  };
  const { normalized, warnings } = normalizeAgentResponse(structuredClone(old));
  const json = (normalized as Record<string, unknown>)['json'] as Record<string, unknown>;
  assert(json['action'] === 'CREATE', 'create_eic=true → action=CREATE');
  assert(json['create_eic'] === undefined, 'create_eic deleted after mapping');
  assert(!warnings.some(w => w.includes('ACTION_INFERRED_UPDATE')), 'no UPDATE inference for non-EIC- id');
}

{
  // create_eic=false → action=NO_ACTION
  const old = { human_summary: ['test'], json: { create_eic: false, eic: null } };
  const { normalized } = normalizeAgentResponse(structuredClone(old));
  const json = (normalized as Record<string, unknown>)['json'] as Record<string, unknown>;
  assert(json['action'] === 'NO_ACTION', 'create_eic=false → action=NO_ACTION');
  assert(json['create_eic'] === undefined, 'create_eic deleted (false case)');
}

{
  // Explicit action remains unchanged
  const obj = { human_summary: ['test'], json: { action: 'UPDATE', eic: validEic() } };
  const { normalized } = normalizeAgentResponse(structuredClone(obj));
  const json = (normalized as Record<string, unknown>)['json'] as Record<string, unknown>;
  assert(json['action'] === 'UPDATE', 'explicit action=UPDATE remains unchanged');
}

{
  // UPDATE inferred from EIC- prefix
  const old = {
    human_summary: ['test'],
    json: {
      create_eic: true,
      eic: validEic({ eic_id: 'EIC-EXIST-999' }),
    },
  };
  const { normalized, warnings } = normalizeAgentResponse(structuredClone(old));
  const json = (normalized as Record<string, unknown>)['json'] as Record<string, unknown>;
  assert(json['action'] === 'UPDATE', 'create_eic=true + EIC- prefix → action=UPDATE');
  assert(warnings.some(w => w.includes('ACTION_INFERRED_UPDATE')), 'UPDATE inference emits warning');
}

{
  // normalizeExpected: create_eic=true → action=CREATE
  const expected = { create_eic: true };
  normalizeExpected(expected);
  assert((expected as Record<string, unknown>)['action'] === 'CREATE', 'normalizeExpected: create_eic=true → CREATE');
}

{
  // normalizeExpected: create_eic=false → action=NO_ACTION
  const expected = { create_eic: false };
  normalizeExpected(expected);
  assert((expected as Record<string, unknown>)['action'] === 'NO_ACTION', 'normalizeExpected: create_eic=false → NO_ACTION');
}

// ===================================================================
// C) Numeric constraints
// ===================================================================

section('C) Numeric constraints');

{
  // influence_strength: 0 → normalized to null with warning (then passes schema since null is allowed)
  const raw = validPayload({}, { influence_strength: 0 });
  const result = extractAndValidate(raw);
  assert(result.ok, 'influence_strength=0 normalized to null, passes schema');
  assert(
    result.warnings.some(w => w.includes('LEGACY_INFLUENCE_ZERO')),
    'influence_strength=0 emits LEGACY_INFLUENCE_ZERO warning',
  );
}

{
  // influence_strength: 6 rejected
  const raw = validPayload({}, { influence_strength: 6 });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'influence_strength=6 fails schema validation');
}

{
  // influence_strength: 2.5 rejected (non-integer)
  const raw = validPayload({}, { influence_strength: 2.5 });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'influence_strength=2.5 (non-integer) fails schema validation');
}

{
  // influence_strength: null accepted (legacy normalized)
  const raw = validPayload({}, { influence_strength: null });
  const result = extractAndValidate(raw);
  assert(result.ok, 'influence_strength=null passes schema validation');
}

{
  // impact_priority: 0 rejected
  const raw = validPayload({}, { impact_priority: 0 });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'impact_priority=0 fails schema validation');
}

{
  // impact_priority: 6 rejected
  const raw = validPayload({}, { impact_priority: 6 });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'impact_priority=6 fails schema validation');
}

{
  // impact_priority: 3.5 rejected (non-integer)
  const raw = validPayload({}, { impact_priority: 3.5 });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'impact_priority=3.5 (non-integer) fails schema validation');
}

// ===================================================================
// D) secondary_tag constraints
// ===================================================================

section('D) secondary_tag constraints');

{
  // Valid: platform_consolidation (2 words, snake_case)
  const raw = validPayload({}, { secondary_tag: 'platform_consolidation' });
  const result = extractAndValidate(raw);
  assert(result.ok, 'secondary_tag "platform_consolidation" passes');
}

{
  // Valid: ai_config_testing (3 words)
  const raw = validPayload({}, { secondary_tag: 'ai_config_testing' });
  const result = extractAndValidate(raw);
  assert(result.ok, 'secondary_tag "ai_config_testing" (3 words) passes');
}

{
  // Valid: null
  const raw = validPayload({}, { secondary_tag: null });
  const result = extractAndValidate(raw);
  assert(result.ok, 'secondary_tag null passes');
}

{
  // Rejected: PascalCase
  const raw = validPayload({}, { secondary_tag: 'PlatformConsolidation' });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'secondary_tag "PlatformConsolidation" (PascalCase) rejected');
}

{
  // Rejected: kebab-case
  const raw = validPayload({}, { secondary_tag: 'platform-consolidation' });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'secondary_tag "platform-consolidation" (kebab-case) rejected');
}

{
  // Rejected: single word
  const raw = validPayload({}, { secondary_tag: 'singleword' });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'secondary_tag "singleword" (single word) rejected');
}

{
  // Rejected: too many words (5)
  const raw = validPayload({}, { secondary_tag: 'too_many_words_in_tag' });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'secondary_tag "too_many_words_in_tag" (5 words) rejected');
}

{
  // Rejected: >32 chars
  const raw = validPayload({}, { secondary_tag: 'this_is_a_very_long_secondary_tag' });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'secondary_tag >32 chars rejected');
}

// ===================================================================
// E) human_summary constraints
// ===================================================================

section('E) human_summary constraints');

{
  // Rejected: empty array
  const raw = JSON.stringify({
    human_summary: [],
    json: { action: 'NO_ACTION', eic: null },
  });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'human_summary [] (empty array) rejected');
}

{
  // Rejected: >8 bullets
  const raw = JSON.stringify({
    human_summary: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    json: { action: 'NO_ACTION', eic: null },
  });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'human_summary >8 bullets rejected');
}

{
  // Rejected: empty string bullet
  const raw = JSON.stringify({
    human_summary: ['valid bullet', ''],
    json: { action: 'NO_ACTION', eic: null },
  });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'human_summary with empty string bullet rejected');
}

{
  // Rejected: >200 char bullet
  const longBullet = 'A'.repeat(201);
  const raw = JSON.stringify({
    human_summary: [longBullet],
    json: { action: 'NO_ACTION', eic: null },
  });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'human_summary with >200 char bullet rejected');
}

{
  // Accepted: exactly 200 chars
  const exactBullet = 'B'.repeat(200);
  const raw = JSON.stringify({
    human_summary: [exactBullet],
    json: { action: 'NO_ACTION', eic: null },
  });
  const result = extractAndValidate(raw);
  assert(result.ok, 'human_summary with exactly 200 char bullet passes');
}

{
  // Duplicate detection (case-insensitive)
  const warnings = checkHumanSummaryDuplicates(['Hello world', 'hello world']);
  assert(warnings.length === 1, 'duplicate_human_summary detected');
  assert(warnings[0].includes('duplicate_human_summary'), 'duplicate warning has correct code');
}

// ===================================================================
// F) Model B coupling rules (confidence × classification)
// ===================================================================

section('F) Model B coupling rules');

{
  // CONFIRMED + Low → warning
  const raw = validPayload({}, {
    impact_classification: 'CONFIRMED',
    confidence: 'Low',
  });
  const result = extractAndValidate(raw);
  assert(result.ok, 'CONFIRMED + Low does not hard-fail (warning only)');
  assert(
    result.warnings.some(w => w.includes('classification_confidence_mismatch')),
    'CONFIRMED + Low emits coupling warning',
  );
}

{
  // HYPOTHESIZED + High → warning
  const raw = validPayload({}, {
    impact_classification: 'HYPOTHESIZED',
    confidence: 'High',
  });
  const result = extractAndValidate(raw);
  assert(result.ok, 'HYPOTHESIZED + High does not hard-fail (warning only)');
  assert(
    result.warnings.some(w => w.includes('classification_confidence_mismatch')),
    'HYPOTHESIZED + High emits coupling warning',
  );
}

{
  // NO_IMPACT + Low → warning
  const raw = validPayload({}, {
    impact_classification: 'NO_IMPACT',
    confidence: 'Low',
  });
  const result = extractAndValidate(raw);
  assert(result.ok, 'NO_IMPACT + Low does not hard-fail');
  assert(
    result.warnings.some(w => w.includes('classification_confidence_mismatch')),
    'NO_IMPACT + Low emits coupling warning',
  );
}

{
  // PROBABLE + Low → passes (any confidence allowed for PROBABLE)
  const raw = validPayload({}, {
    impact_classification: 'PROBABLE',
    confidence: 'Low',
  });
  const result = extractAndValidate(raw);
  assert(result.ok, 'PROBABLE + Low passes');
  assert(
    !result.warnings.some(w => w.includes('classification_confidence_mismatch')),
    'PROBABLE + Low emits no coupling warning',
  );
}

{
  // CONFIRMED + High → passes (happy path)
  const raw = validPayload({}, {
    impact_classification: 'CONFIRMED',
    confidence: 'High',
  });
  const result = extractAndValidate(raw);
  assert(result.ok, 'CONFIRMED + High passes');
  assert(
    !result.warnings.some(w => w.includes('classification_confidence_mismatch')),
    'CONFIRMED + High emits no coupling warning',
  );
}

// ===================================================================
// G) Normalizer warnings
// ===================================================================

section('G) Normalizer warning codes');

{
  // LEGACY_INFLUENCE_ZERO
  const old = {
    human_summary: ['test'],
    json: {
      create_eic: true,
      eic: {
        ...validEic({ influence_strength: 0 }),
      },
    },
  };
  const { warnings } = normalizeAgentResponse(structuredClone(old));
  assert(
    warnings.some(w => w.includes('LEGACY_INFLUENCE_ZERO')),
    'influence_strength=0 emits LEGACY_INFLUENCE_ZERO',
  );
}

{
  // IMPACT_CLASSIFICATION_DEFAULTED
  const old = {
    human_summary: ['test'],
    json: {
      create_eic: true,
      eic: {
        ...validEic(),
      },
    },
  };
  delete (old.json.eic as Record<string, unknown>)['impact_classification'];
  const { normalized, warnings } = normalizeAgentResponse(structuredClone(old));
  const eic = ((normalized as Record<string, unknown>)['json'] as Record<string, unknown>)['eic'] as Record<string, unknown>;
  assert(eic['impact_classification'] === 'HYPOTHESIZED', 'missing impact_classification defaults to HYPOTHESIZED');
  assert(
    warnings.some(w => w.includes('IMPACT_CLASSIFICATION_DEFAULTED')),
    'defaulted classification emits IMPACT_CLASSIFICATION_DEFAULTED',
  );
}

{
  // intelligence_status alias → status
  const obj = {
    human_summary: ['test'],
    json: {
      action: 'CREATE',
      eic: {
        ...validEic({ status: undefined }),
        intelligence_status: 'Monitoring',
      },
    },
  };
  delete (obj.json.eic as Record<string, unknown>)['status'];
  const { normalized } = normalizeAgentResponse(structuredClone(obj));
  const eic = ((normalized as Record<string, unknown>)['json'] as Record<string, unknown>)['eic'] as Record<string, unknown>;
  assert(eic['status'] === 'Monitoring', 'intelligence_status copied to status');
  assert(eic['intelligence_status'] === undefined, 'intelligence_status deleted after aliasing');
}

// ===================================================================
// H) Schema: commercial_outcome accepted
// ===================================================================

section('H) Optional v2 fields accepted');

{
  const raw = validPayload({}, { commercial_outcome: 'OPEN' });
  const result = extractAndValidate(raw);
  assert(result.ok, 'commercial_outcome=OPEN passes schema');
}

{
  const raw = validPayload({}, { commercial_outcome: 'CLOSED_WON' });
  const result = extractAndValidate(raw);
  assert(result.ok, 'commercial_outcome=CLOSED_WON passes schema');
}

{
  const raw = validPayload({}, { commercial_outcome: 'INVALID' });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'commercial_outcome=INVALID rejected by schema');
}

// ===================================================================
// I) Golden v2 payloads (end-to-end validate)
// ===================================================================

section('I) Golden v2 payloads');

{
  // Realistic CREATE
  const create = JSON.stringify({
    human_summary: [
      'Strong experimentation signal from competitive displacement',
      'Exec sponsor actively involved',
    ],
    rationale: {
      because: [
        { claim: 'Experimentation is the deciding factor vs competitor', evidence_refs: ['ev-1'] },
        { claim: 'VP Engineering is executive sponsor', evidence_refs: ['ev-2'] },
      ],
      assumptions: ['Timeline holds at Q2'],
      open_questions: ['Budget allocation for experimentation tooling'],
    },
    json: {
      action: 'CREATE',
      eic: {
        eic_id: 'EIC-GOLDEN-001',
        account: 'Golden Corp',
        opportunity: 'Golden - Platform Expansion',
        opportunity_link: 'https://crm.example.com/opps/golden-001',
        stage: '3 - Proposal',
        stage_bucket: 'Mid',
        motion: 'Expansion',
        ae_owner: 'Jane Doe',
        experimentation_team_engaged: 'Yes',
        influence_strength: 4,
        confidence: 'High',
        impact_classification: 'CONFIRMED',
        impact_priority: 4,
        primary_influence_tag: 'competitive_displacement',
        secondary_tag: 'platform_consolidation',
        ai_configs_adjacent: 'No',
        competitive_mention: 'Yes',
        exec_sponsor_mentioned: 'Yes',
        summary_why_it_matters: 'Experimentation capability is the deciding factor in competitive eval.',
        evidence: [
          { evidence_id: 'ev-1', source_type: 'Gong', url: 'https://gong.example.com/call/123', timestamp_utc: '2026-03-01T14:00:00Z', snippet: 'They want built-in experimentation.' },
          { evidence_id: 'ev-2', source_type: 'CRM', url: 'https://crm.example.com/notes/456', snippet: 'VP Eng Mark Lee signed off.' },
        ],
        next_checkpoint: '2026-04-15',
        status: 'Active',
      },
    },
  });
  const result = extractAndValidate(create);
  assert(result.ok, 'golden CREATE payload passes full validation');
  assert(result.warnings.length === 0, 'golden CREATE has no warnings');
}

{
  // Realistic UPDATE
  const update = JSON.stringify({
    human_summary: [
      'Closed won — experimentation was key upgrade reason',
      'Update existing EIC to reflect outcome',
    ],
    rationale: {
      because: [
        { claim: 'Customer explicitly cited experimentation as upgrade driver', evidence_refs: ['ev-1'] },
      ],
      assumptions: [],
      open_questions: [],
    },
    json: {
      action: 'UPDATE',
      eic: {
        eic_id: 'EIC-0012',
        account: 'Adventure Works',
        opportunity: 'Adventure Works - Expansion FY26',
        opportunity_link: 'https://salesforce/oppty/010',
        stage: 'CW - Closed Won',
        stage_bucket: 'Closed',
        motion: 'Expansion',
        ae_owner: 'Chris Wong',
        experimentation_team_engaged: 'Yes',
        influence_strength: 4,
        confidence: 'High',
        impact_classification: 'CONFIRMED',
        impact_priority: 3,
        primary_influence_tag: 'expansion_catalyst',
        secondary_tag: null,
        ai_configs_adjacent: 'No',
        competitive_mention: 'Unknown',
        exec_sponsor_mentioned: 'No',
        summary_why_it_matters: 'Customer cited experimentation as key reason for upgrading.',
        evidence: [
          { evidence_id: 'ev-1', source_type: 'Salesforce', url: 'https://salesforce/oppty/010/notes' },
        ],
        next_checkpoint: '2026-03-17',
        status: 'Active',
        commercial_outcome: 'CLOSED_WON',
      },
    },
  });
  const result = extractAndValidate(update);
  assert(result.ok, 'golden UPDATE payload passes full validation');
  assert(result.warnings.length === 0, 'golden UPDATE has no warnings');
}

// ===================================================================
// J) Conditional schema (action ↔ eic)
// ===================================================================

section('J) Conditional schema enforcement');

{
  // action=CREATE, eic=null → must fail
  const raw = JSON.stringify({
    human_summary: ['test'],
    json: { action: 'CREATE', eic: null },
  });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'action=CREATE with eic=null fails');
  assert(
    result.failures.some(f => f.detail.includes('Conditional schema failed')),
    'conditional schema failure message present',
  );
}

{
  // action=NO_ACTION, eic=object → must fail
  const raw = JSON.stringify({
    human_summary: ['test'],
    json: { action: 'NO_ACTION', eic: validEic() },
  });
  const result = extractAndValidate(raw);
  assert(!result.ok, 'action=NO_ACTION with eic=object fails');
}

// ===================================================================
// K) Warnings propagated from normalization into extraction
// ===================================================================

section('K) Normalization warnings propagated');

{
  // v1 payload with influence_strength=0 → LEGACY_INFLUENCE_ZERO warning in extraction
  const v1 = {
    human_summary: ['test'],
    json: {
      create_eic: true,
      eic: {
        ...validEic({ influence_strength: 0 }),
      },
    },
  };
  delete (v1.json.eic as Record<string, unknown>)['impact_classification'];
  const raw = JSON.stringify(v1);
  const result = extractAndValidate(raw);
  assert(
    result.warnings.some(w => w.includes('LEGACY_INFLUENCE_ZERO')),
    'LEGACY_INFLUENCE_ZERO propagated through extractAndValidate',
  );
}

// ===================================================================
// L) Regression guard: deprecated fields never survive normalization
// ===================================================================

section('L) Legacy field cleanup regression');

{
  const legacy = {
    human_summary: ['test'],
    json: {
      create_eic: true,
      eic: {
        eic_id: 'EIC-REG-001',
        account: 'RegCo',
        opportunity: 'RegCo - Test',
        opportunity_link: null,
        stage: '2 - Discovery',
        stage_bucket: 'Early',
        motion: 'Net-new',
        ae_owner: 'Tester',
        experimentation_team_engaged: 'Yes',
        influence_strength: 3,
        confidence: 'Medium',
        impact_priority: 3,
        primary_influence_tag: 'release_velocity',
        secondary_tag: 'test_tag',
        ai_configs_adjacent: 'No',
        competitive_mention: 'No',
        exec_sponsor_mentioned: 'No',
        summary_why_it_matters: 'Regression guard test.',
        evidence_citation_1: 'https://example.com/ev1',
        evidence_citation_2: 'https://example.com/ev2',
        next_checkpoint: '2026-06-01',
        intelligence_status: 'Active',
      },
    },
  };

  const { normalized, warnings } = normalizeAgentResponse(structuredClone(legacy));
  const root = normalized as Record<string, unknown>;
  const json = root['json'] as Record<string, unknown>;
  const eic = json['eic'] as Record<string, unknown>;

  // create_eic must be gone, action must exist
  assert(json['create_eic'] === undefined, 'json.create_eic deleted after normalization');
  assert(typeof json['action'] === 'string', 'json.action exists after normalization');
  assert(json['action'] === 'UPDATE', 'action inferred as UPDATE (EIC- prefix)');

  // evidence_citation_* must be gone, evidence[] must exist
  assert(eic['evidence_citation_1'] === undefined, 'eic.evidence_citation_1 deleted');
  assert(eic['evidence_citation_2'] === undefined, 'eic.evidence_citation_2 deleted');
  assert(Array.isArray(eic['evidence']), 'eic.evidence[] exists');
  assert((eic['evidence'] as unknown[]).length === 2, 'evidence[] has 2 entries from legacy citations');

  // intelligence_status must be gone, status must exist
  assert(eic['intelligence_status'] === undefined, 'eic.intelligence_status deleted');
  assert(eic['status'] === 'Active', 'eic.status populated from intelligence_status');

  // impact_classification defaulted
  assert(eic['impact_classification'] === 'HYPOTHESIZED', 'impact_classification defaulted to HYPOTHESIZED');

  // Only expected warnings present
  const expectedCodes = ['ACTION_INFERRED_UPDATE', 'IMPACT_CLASSIFICATION_DEFAULTED'];
  for (const code of expectedCodes) {
    assert(warnings.some(w => w.includes(code)), `expected warning ${code} present`);
  }
  const unexpectedWarnings = warnings.filter(
    w => !expectedCodes.some(c => w.includes(c)),
  );
  assert(unexpectedWarnings.length === 0, `no unexpected warnings (got: ${unexpectedWarnings.join('; ') || 'none'})`);
}

// ===================================================================
// M) EIC Store: CREATE/UPDATE determinism
// ===================================================================

section('M) EIC Store: CREATE/UPDATE determinism');

function storeEic(overrides: Partial<EICFields> = {}): EICFields {
  return {
    eic_id: 'EIC-STORE-001',
    account: 'StoreCo',
    opportunity: 'StoreCo - Test',
    opportunity_link: null,
    stage: '3 - Proposal',
    stage_bucket: 'Mid',
    motion: 'Expansion',
    ae_owner: 'Tester',
    experimentation_team_engaged: 'Yes',
    influence_strength: 4,
    confidence: 'High',
    impact_classification: 'CONFIRMED',
    impact_priority: 4,
    primary_influence_tag: 'release_velocity',
    secondary_tag: 'deployment_pipeline',
    ai_configs_adjacent: 'No',
    competitive_mention: 'No',
    exec_sponsor_mentioned: 'No',
    summary_why_it_matters: 'Store test.',
    evidence: [{ evidence_id: 'ev-1', source_type: 'Gong', url: 'https://example.com/1' }],
    next_checkpoint: '2026-06-01',
    status: 'Active',
    ...overrides,
  } as EICFields;
}

{
  // CREATE inserts exactly one record
  const store = new InMemoryEicStore();
  const result = store.upsert('CREATE', storeEic());
  assert(result.created === true, 'CREATE returns created=true');
  assert(result.updated === false, 'CREATE returns updated=false');
  assert(store.size() === 1, 'store has exactly 1 record after CREATE');
  assert(store.get('EIC-STORE-001') !== undefined, 'record retrievable by eic_id');
}

{
  // UPDATE modifies existing, size stays 1
  const store = new InMemoryEicStore();
  store.upsert('CREATE', storeEic());
  const updated = storeEic({ summary_why_it_matters: 'Updated summary.' });
  const result = store.upsert('UPDATE', updated);
  assert(result.created === false, 'UPDATE returns created=false');
  assert(result.updated === true, 'UPDATE returns updated=true');
  assert(store.size() === 1, 'store size stays 1 after UPDATE (no duplicate)');
  assert(store.get('EIC-STORE-001')!.summary_why_it_matters === 'Updated summary.', 'record reflects updated field');
}

{
  // UPDATE for non-existent id throws
  const store = new InMemoryEicStore();
  let threw = false;
  try {
    store.upsert('UPDATE', storeEic({ eic_id: 'EIC-NONEXISTENT' }));
  } catch (e) {
    threw = true;
    assert(
      (e as Error).message.includes('does not exist'),
      'UPDATE throw message mentions non-existence',
    );
  }
  assert(threw, 'UPDATE on non-existent id throws');
}

{
  // CREATE with existing id throws
  const store = new InMemoryEicStore();
  store.upsert('CREATE', storeEic());
  let threw = false;
  try {
    store.upsert('CREATE', storeEic());
  } catch (e) {
    threw = true;
    assert(
      (e as Error).message.includes('already exists'),
      'CREATE throw message mentions duplicate',
    );
  }
  assert(threw, 'CREATE on existing id throws (no silent duplicates)');
  assert(store.size() === 1, 'store size still 1 after rejected duplicate CREATE');
}

{
  // NO_ACTION is a no-op
  const store = new InMemoryEicStore();
  const result = store.upsert('NO_ACTION', storeEic());
  assert(result.created === false, 'NO_ACTION returns created=false');
  assert(result.updated === false, 'NO_ACTION returns updated=false');
  assert(store.size() === 0, 'store empty after NO_ACTION');
}

{
  // Multiple distinct CREATEs
  const store = new InMemoryEicStore();
  store.upsert('CREATE', storeEic({ eic_id: 'EIC-A' }));
  store.upsert('CREATE', storeEic({ eic_id: 'EIC-B' }));
  assert(store.size() === 2, 'store has 2 records after 2 distinct CREATEs');
  assert(store.all().length === 2, 'all() returns both records');
}

// ===================================================================
// N) Legacy status CW/CL mapping
// ===================================================================

section('N) Legacy status CW/CL mapping');

{
  // CW → status=Active + commercial_outcome=CLOSED_WON + warning
  const legacy = {
    human_summary: ['test'],
    json: {
      action: 'UPDATE',
      eic: validEic({ status: 'CW' }),
    },
  };
  const { normalized, warnings } = normalizeAgentResponse(structuredClone(legacy));
  const eic = ((normalized as Record<string, unknown>)['json'] as Record<string, unknown>)['eic'] as Record<string, unknown>;
  assert(eic['status'] === 'Active', 'legacy CW: status mapped to Active');
  assert(eic['commercial_outcome'] === 'CLOSED_WON', 'legacy CW: commercial_outcome set to CLOSED_WON');
  assert(
    warnings.some(w => w.includes('LEGACY_STATUS_CW_CL_MAPPED')),
    'legacy CW: LEGACY_STATUS_CW_CL_MAPPED warning emitted',
  );
}

{
  // CL → status=Active + commercial_outcome=CLOSED_LOST + warning
  const legacy = {
    human_summary: ['test'],
    json: {
      action: 'UPDATE',
      eic: validEic({ status: 'CL' }),
    },
  };
  const { normalized, warnings } = normalizeAgentResponse(structuredClone(legacy));
  const eic = ((normalized as Record<string, unknown>)['json'] as Record<string, unknown>)['eic'] as Record<string, unknown>;
  assert(eic['status'] === 'Active', 'legacy CL: status mapped to Active');
  assert(eic['commercial_outcome'] === 'CLOSED_LOST', 'legacy CL: commercial_outcome set to CLOSED_LOST');
  assert(
    warnings.some(w => w.includes('LEGACY_STATUS_CW_CL_MAPPED')),
    'legacy CL: LEGACY_STATUS_CW_CL_MAPPED warning emitted',
  );
}

{
  // CW with existing commercial_outcome → status mapped but outcome preserved
  const legacy = {
    human_summary: ['test'],
    json: {
      action: 'UPDATE',
      eic: validEic({ status: 'CW', commercial_outcome: 'OPEN' }),
    },
  };
  const { normalized } = normalizeAgentResponse(structuredClone(legacy));
  const eic = ((normalized as Record<string, unknown>)['json'] as Record<string, unknown>)['eic'] as Record<string, unknown>;
  assert(eic['status'] === 'Active', 'CW with existing outcome: status still mapped to Active');
  assert(eic['commercial_outcome'] === 'OPEN', 'CW with existing outcome: pre-existing commercial_outcome preserved');
}

{
  // Payload with CW passes full validation after normalization
  const raw = validPayload({}, { status: 'CW' });
  const result = extractAndValidate(raw);
  assert(result.ok, 'legacy CW passes full validation after normalization');
  assert(
    result.warnings.some(w => w.includes('LEGACY_STATUS_CW_CL_MAPPED')),
    'legacy CW: warning propagated through extractAndValidate',
  );
}

{
  // Schema rejects raw CW when normalization is bypassed
  const AjvCtor = ('default' in AjvModule ? AjvModule.default : AjvModule) as typeof AjvModule.default;
  const rawAjv = new AjvCtor({ allErrors: true });
  const rawValidate = rawAjv.compile(agentResponseSchema);
  const rawPayload = {
    human_summary: ['test'],
    json: {
      action: 'UPDATE',
      eic: {
        ...validEic({ status: 'CW' }),
      },
    },
  };
  assert(!rawValidate(rawPayload), 'schema rejects raw CW when normalization is bypassed');
}

{
  // Schema rejects raw CL when normalization is bypassed
  const AjvCtor = ('default' in AjvModule ? AjvModule.default : AjvModule) as typeof AjvModule.default;
  const rawAjv = new AjvCtor({ allErrors: true });
  const rawValidate = rawAjv.compile(agentResponseSchema);
  const rawPayload = {
    human_summary: ['test'],
    json: {
      action: 'UPDATE',
      eic: {
        ...validEic({ status: 'CL' }),
      },
    },
  };
  assert(!rawValidate(rawPayload), 'schema rejects raw CL when normalization is bypassed');
}

// ===================================================================
// Summary
// ===================================================================

console.log(`\n${'='.repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
