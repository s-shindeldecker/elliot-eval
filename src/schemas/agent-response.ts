/**
 * AJV JSON Schema for the Elliot agent output contract (v2).
 *
 * Key changes from v1:
 *   - json.action replaces json.create_eic (back-compat: normalizer maps boolean→action)
 *   - eic.evidence[] replaces evidence_citation_1/evidence_citation_2
 *   - eic.impact_classification added
 *   - influence_strength range tightened to 1–5 (or null for legacy payloads)
 *   - secondary_tag gains snake_case pattern + maxLength
 *   - human_summary items gain maxLength 200
 *   - confidence adds "Low"
 *   - optional top-level rationale with structured claims
 *
 * Uses if/then/else on json.action:
 *   CREATE or UPDATE → eic must be a full EIC object
 *   NO_ACTION        → eic must be null
 *
 * additionalProperties: false at every nesting level.
 */

const evidenceRefSchema = {
  type: 'object' as const,
  required: ['evidence_id', 'source_type', 'url'],
  additionalProperties: false,
  properties: {
    evidence_id:    { type: 'string' as const, minLength: 1 },
    source_type:    { type: 'string' as const, minLength: 1 },
    url:            { type: 'string' as const, minLength: 1 },
    timestamp_utc:  { type: ['string' as const, 'null' as const] },
    snippet:        { type: ['string' as const, 'null' as const] },
  },
};

const rationaleClaimSchema = {
  type: 'object' as const,
  required: ['claim', 'evidence_refs'],
  additionalProperties: false,
  properties: {
    claim:          { type: 'string' as const, minLength: 1 },
    evidence_refs:  {
      type: 'array' as const,
      items: { type: 'string' as const, minLength: 1 },
      minItems: 1,
    },
  },
};

const rationaleSchema = {
  type: 'object' as const,
  required: ['because', 'assumptions', 'open_questions'],
  additionalProperties: false,
  properties: {
    because: {
      type: 'array' as const,
      items: rationaleClaimSchema,
      minItems: 1,
      maxItems: 10,
    },
    assumptions: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
    open_questions: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
  },
};

const eicObjectSchema = {
  type: 'object' as const,
  required: [
    'eic_id',
    'account',
    'opportunity',
    'opportunity_link',
    'stage',
    'stage_bucket',
    'motion',
    'ae_owner',
    'experimentation_team_engaged',
    'influence_strength',
    'confidence',
    'impact_classification',
    'impact_priority',
    'primary_influence_tag',
    'secondary_tag',
    'ai_configs_adjacent',
    'competitive_mention',
    'exec_sponsor_mentioned',
    'summary_why_it_matters',
    'evidence',
    'next_checkpoint',
    'status',
  ],
  additionalProperties: false,
  properties: {
    eic_id:                       { type: 'string' as const, minLength: 1 },
    account:                      { type: 'string' as const, minLength: 1 },
    opportunity:                  { type: 'string' as const, minLength: 1 },
    opportunity_link:             { type: ['string' as const, 'null' as const], minLength: 1 },
    stage:                        { type: 'string' as const, minLength: 1 },
    stage_bucket:                 { type: 'string' as const, enum: ['Early', 'Mid', 'Late', 'Closed'] },
    motion:                       { type: 'string' as const, enum: ['Net-new', 'Expansion', 'Renewal', 'Other'] },
    ae_owner:                     { type: 'string' as const, minLength: 1 },
    experimentation_team_engaged: { type: 'string' as const, enum: ['Yes', 'No', 'Unknown'] },
    influence_strength:           { type: ['integer' as const, 'null' as const], minimum: 1, maximum: 5 },
    confidence:                   { type: 'string' as const, enum: ['Low', 'Medium', 'High'] },
    impact_classification:        { type: 'string' as const, enum: ['CONFIRMED', 'PROBABLE', 'HYPOTHESIZED', 'NO_IMPACT'] },
    impact_priority:              { type: 'integer' as const, minimum: 1, maximum: 5 },
    primary_influence_tag:        { type: 'string' as const, minLength: 1 },
    secondary_tag: {
      type: ['string' as const, 'null' as const],
      pattern: '^[a-z0-9]+(?:_[a-z0-9]+){1,3}$',
      maxLength: 32,
    },
    ai_configs_adjacent:          { type: 'string' as const, enum: ['Yes', 'No', 'Unknown'] },
    competitive_mention:          { type: 'string' as const, enum: ['Yes', 'No', 'Unknown'] },
    exec_sponsor_mentioned:       { type: 'string' as const, enum: ['Yes', 'No', 'Unknown'] },
    summary_why_it_matters:       { type: 'string' as const, minLength: 1 },
    evidence: {
      type: 'array' as const,
      items: evidenceRefSchema,
      minItems: 1,
    },
    next_checkpoint: {
      type: ['string' as const, 'null' as const],
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    status:                       { type: 'string' as const, enum: ['Active', 'Monitoring', 'Under Review'] },
    intelligence_status:          { type: 'string' as const, enum: ['Active', 'Monitoring', 'Under Review'] },
    commercial_outcome:           { type: 'string' as const, enum: ['OPEN', 'CLOSED_WON', 'CLOSED_LOST'] },
  },
};

export const agentResponseSchema = {
  type: 'object' as const,
  required: ['human_summary', 'json'],
  additionalProperties: false,
  properties: {
    human_summary: {
      type: 'array' as const,
      items: { type: 'string' as const, minLength: 1, maxLength: 200 },
      minItems: 1,
      maxItems: 8,
    },
    rationale: rationaleSchema,
    json: {
      type: 'object' as const,
      required: ['action', 'eic'],
      additionalProperties: false,
      properties: {
        action: { type: 'string' as const, enum: ['CREATE', 'UPDATE', 'NO_ACTION'] },
        eic: {},
      },
      if: {
        properties: { action: { enum: ['CREATE', 'UPDATE'] } },
      },
      then: {
        properties: { eic: eicObjectSchema },
      },
      else: {
        properties: { eic: { type: 'null' as const } },
      },
    },
  },
};
