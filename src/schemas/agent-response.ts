/**
 * AJV JSON Schema for the Elliot agent output contract.
 *
 * Uses if/then/else on json.create_eic:
 *   true  → eic must be a full EIC object (all required fields)
 *   false → eic must be null
 *
 * additionalProperties: false at every nesting level.
 */

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
    'impact_priority',
    'primary_influence_tag',
    'secondary_tag',
    'ai_configs_adjacent',
    'competitive_mention',
    'exec_sponsor_mentioned',
    'summary_why_it_matters',
    'evidence_citation_1',
    'evidence_citation_2',
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
    influence_strength:           { type: 'integer' as const, minimum: 0, maximum: 5 },
    confidence:                   { type: 'string' as const, enum: ['Medium', 'High'] },
    impact_priority:              { type: 'integer' as const, minimum: 1, maximum: 5 },
    primary_influence_tag:        { type: 'string' as const, minLength: 1 },
    secondary_tag:                { type: ['string' as const, 'null' as const] },
    ai_configs_adjacent:          { type: 'string' as const, enum: ['Yes', 'No', 'Unknown'] },
    competitive_mention:          { type: 'string' as const, enum: ['Yes', 'No', 'Unknown'] },
    exec_sponsor_mentioned:       { type: 'string' as const, enum: ['Yes', 'No', 'Unknown'] },
    summary_why_it_matters:       { type: 'string' as const, minLength: 1 },
    evidence_citation_1:          { type: 'string' as const, minLength: 1 },
    evidence_citation_2:          { type: ['string' as const, 'null' as const] },
    next_checkpoint:              {
      type: ['string' as const, 'null' as const],
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    status:                       { type: 'string' as const, enum: ['Active', 'Monitoring', 'Under Review', 'CW', 'CL'] },
  },
};

export const agentResponseSchema = {
  type: 'object' as const,
  required: ['human_summary', 'json'],
  additionalProperties: false,
  properties: {
    human_summary: {
      type: 'array' as const,
      items: { type: 'string' as const, minLength: 1 },
      minItems: 1,
      maxItems: 8,
    },
    json: {
      type: 'object' as const,
      required: ['create_eic', 'eic'],
      additionalProperties: false,
      properties: {
        create_eic: { type: 'boolean' as const },
        eic: {},
      },
      if: {
        properties: { create_eic: { const: true } },
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
