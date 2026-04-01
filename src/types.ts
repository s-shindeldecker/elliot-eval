import type {
  YesNoUnknown,
  StageBucket,
  Motion,
  Confidence,
  EicStatus,
  Action,
  ImpactClassification,
  CommercialOutcome,
} from './shared/enums.js';

export type {
  YesNoUnknown,
  StageBucket,
  Motion,
  Confidence,
  EicStatus,
  Action,
  ImpactClassification,
  CommercialOutcome,
};

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

export const HARD_FAIL_CODES: ReadonlySet<FailureCode> = new Set([
  'HALLUCINATED_CITATION',
  'SCHEMA_INVALID',
  'JSON_PARSE_ERROR',
  'ADAPTER_ERROR',
  'CONFIG_ERROR',
  'TIMEOUT',
] as const);

export type Stage = 'screening' | 'gold';

// ---------------------------------------------------------------------------
// Evidence reference — replaces evidence_citation_1 / evidence_citation_2
// ---------------------------------------------------------------------------

export interface EvidenceRef {
  evidence_id: string;
  source_type: string;
  url: string;
  timestamp_utc?: string | null;
  snippet?: string | null;
}

// ---------------------------------------------------------------------------
// Structured rationale — evidence-referenced reasoning
// ---------------------------------------------------------------------------

export interface RationaleClaim {
  claim: string;
  evidence_refs: string[];
}

export interface Rationale {
  because: RationaleClaim[];
  assumptions: string[];
  open_questions: string[];
}

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
  create_eic?: boolean;
  action?: Action;
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
  impact_classification?: ImpactClassification;

  // Range / set checks → RANGE_VIOLATION
  influence_strength_range?: [number, number];
  impact_priority_range?: [number, number];
  confidence_allowed?: Confidence[];

  // Set checks — when present for a field, overrides its exact-match check above.
  // Named as {field}_allowed (e.g. primary_influence_tag_allowed, competitive_mention_allowed).
  primary_influence_tag_allowed?: string[];
  competitive_mention_allowed?: string[];
  status_allowed?: string[];
}

// ---------------------------------------------------------------------------
// EIC (Experimentation Impact Card) — the agent's structured output (v2)
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
  influence_strength: number | null;
  confidence: Confidence;
  impact_classification: ImpactClassification;
  impact_priority: number;
  primary_influence_tag: string;
  secondary_tag: string | null;
  ai_configs_adjacent: YesNoUnknown;
  competitive_mention: YesNoUnknown;
  exec_sponsor_mentioned: YesNoUnknown;
  summary_why_it_matters: string;
  evidence: EvidenceRef[];
  next_checkpoint: string | null;
  status: EicStatus;

  // Optional v2 aliases / additions
  intelligence_status?: EicStatus;
  commercial_outcome?: CommercialOutcome;

  // v1 back-compat (populated by normalizer from legacy payloads)
  evidence_citation_1?: string;
  evidence_citation_2?: string | null;
}

// ---------------------------------------------------------------------------
// Agent response — the strict output contract for every agent (v2)
// ---------------------------------------------------------------------------

export interface AgentResponse {
  human_summary: string[];
  rationale?: Rationale;
  json: {
    action: Action;
    create_eic?: boolean;
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
  warnings: string[];
  score: number;
  latencyMs: number;
  rawTextLength: number;
  rawTextSnippet: string;
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
  hard_fail_count: number;
  meetsThreshold: boolean;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p90_latency_ms: number;
  parse_success_rate: number;
  failureCounts: Partial<Record<FailureCode, number>>;
}
