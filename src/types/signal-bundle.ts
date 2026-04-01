import type { YesNoUnknown, StageBucket, Motion } from '../shared/enums.js';

export type { YesNoUnknown, StageBucket, Motion };

export interface EvidenceItem {
  source_type: string;
  source_id: string;
  source_link?: string | null;
  timestamp?: string | null;
  snippet: string;
}

export interface OpportunitySnapshot {
  eic_id?: string | null;
  account: string;
  opportunity: string;
  opportunity_link?: string | null;
  stage?: string | null;
  stage_bucket?: StageBucket | null;
  motion?: Motion | null;
  ae_owner?: string | null;
  experimentation_team_engaged?: YesNoUnknown | null;
  ai_configs_adjacent?: YesNoUnknown | null;
  competitive_mention?: YesNoUnknown | null;
  competitive_detail?: string | null;
  exec_sponsor_mentioned?: YesNoUnknown | null;
  exec_sponsor_detail?: string | null;
  next_checkpoint?: string | null;
  amount?: number | null;
  expected_revenue?: number | null;
  probability?: number | null;
  account_type?: string | null;
  arr?: number | null;
  industry?: string | null;
  owner?: string | null;
  lifecycle_stage?: string | null;
}

export interface FeedbackTrajectory {
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  early_complaints: number;
  early_praise: number;
  recent_complaints: number;
  recent_praise: number;
  summary: string;
}

export interface SignalBundle {
  id: string;
  title: string;
  snapshot: OpportunitySnapshot;
  evidence: EvidenceItem[];
  notes?: string[];
  feedbackTrajectory?: FeedbackTrajectory;
}
