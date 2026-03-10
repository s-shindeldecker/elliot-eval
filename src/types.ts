export const FAILURE_CODES = [
  'SCHEMA_INVALID',
  'JSON_PARSE_ERROR',
  'DECISION_MISMATCH',
  'FIELD_MISMATCH',
  'RANGE_VIOLATION',
  'HALLUCINATED_CITATION',
  'MISSING_REQUIRED_FIELD',
  'ADAPTER_ERROR',
  'TIMEOUT',
  'CONFIG_ERROR',
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];

export type Stage = 'screening' | 'gold';

// ---------------------------------------------------------------------------
// Elliot EIC enums
// ---------------------------------------------------------------------------

export type YesNoUnknown = 'Yes' | 'No' | 'Unknown';
export type StageBucket = 'Early' | 'Mid' | 'Late' | 'Closed';
export type Motion = 'Net-new' | 'Expansion' | 'Renewal' | 'Other';
export type Confidence = 'Medium' | 'High';
export type EicStatus = 'Active' | 'Monitoring' | 'Under Review' | 'CW' | 'CL';

// ---------------------------------------------------------------------------
// Dataset row — the input JSONL contract
// ---------------------------------------------------------------------------

export interface DatasetRow {
  id: string;
  input_text: string;
  expected: ExpectedOutput;
  tags?: string[];
}

export interface ExpectedOutput {
  create_eic: boolean;
  eic?: ExpectedEic;
}

export interface ExpectedEic {
  // Exact-match fields → FIELD_MISMATCH
  status?: EicStatus;
  primary_influence_tag?: string;
  secondary_tag?: string | null;
  ai_configs_adjacent?: YesNoUnknown;
  competitive_mention?: YesNoUnknown;
  exec_sponsor_mentioned?: YesNoUnknown;
  experimentation_team_engaged?: YesNoUnknown;
  stage_bucket?: StageBucket;
  motion?: Motion;

  // Range / set checks → RANGE_VIOLATION
  influence_strength_range?: [number, number];
  impact_priority_range?: [number, number];
  confidence_allowed?: Confidence[];
}

// ---------------------------------------------------------------------------
// EIC (Experimentation Impact Card) — the agent's structured output
// ---------------------------------------------------------------------------

export interface EICFields {
  eic_id: string;
  account: string;
  opportunity: string;
  opportunity_link: string | null;
  stage: string;
  stage_bucket: StageBucket;
  motion: Motion;
  ae_owner: string;
  experimentation_team_engaged: YesNoUnknown;
  influence_strength: number;
  confidence: Confidence;
  impact_priority: number;
  primary_influence_tag: string;
  secondary_tag: string | null;
  ai_configs_adjacent: YesNoUnknown;
  competitive_mention: YesNoUnknown;
  exec_sponsor_mentioned: YesNoUnknown;
  summary_why_it_matters: string;
  evidence_citation_1: string;
  evidence_citation_2: string | null;
  next_checkpoint: string | null;
  status: EicStatus;
}

// ---------------------------------------------------------------------------
// Agent response — the strict output contract for every agent
// ---------------------------------------------------------------------------

export interface AgentResponse {
  human_summary: string[];
  json: {
    create_eic: boolean;
    eic: EICFields | null;
  };
}

// ---------------------------------------------------------------------------
// Evaluation result — one per (agent × case)
// ---------------------------------------------------------------------------

export interface EvalResult {
  caseId: string;
  agentName: string;
  pass: boolean;
  disqualified: boolean;
  failure_reasons: FailureCode[];
  failure_details: string[];
  score: number;
  latencyMs: number;
  rawTextLength: number;
  parsed_json_present: boolean;
  error?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Per-agent summary (aggregated after all cases)
// ---------------------------------------------------------------------------

export interface AgentSummary {
  agentName: string;
  stage: Stage;
  totalCases: number;
  passed: number;
  failed: number;
  disqualified_count: number;
  passRate: number;
  meetsThreshold: boolean;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p90_latency_ms: number;
  parse_success_rate: number;
  failureCounts: Partial<Record<FailureCode, number>>;
}
