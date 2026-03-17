/**
 * Scout v0 — Salesforce-shaped deterministic Scout.
 *
 * Converts a minimal Salesforce opportunity record into a valid SignalBundle.
 * No external API calls. No decisioning. Pure data mapping.
 */

import type { SignalBundle, EvidenceItem, OpportunitySnapshot } from '../types/signal-bundle.js';
import type { StageBucket, Motion, YesNoUnknown } from '../shared/enums.js';

// ---------------------------------------------------------------------------
// Input type — minimal Salesforce opportunity record
// ---------------------------------------------------------------------------

export interface SalesforceOpportunityInput {
  id: string;
  account: string;
  opportunity: string;
  opportunity_link: string;
  stage: string;
  ae_owner?: string | null;
  next_step?: string | null;
  description?: string | null;
  notes?: string[] | null;
  close_date?: string | null;
  motion_hint?: 'Net-new' | 'Expansion' | 'Renewal' | 'Other' | null;
  competitor?: string | null;
  exec_sponsor?: string | null;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function runScoutV0(input: SalesforceOpportunityInput): SignalBundle {
  return {
    id: input.id,
    title: `Scout v0 — ${input.opportunity}`,
    snapshot: buildSnapshot(input),
    evidence: buildEvidence(input),
    notes: buildNotes(input),
  };
}

// ---------------------------------------------------------------------------
// Snapshot mapping
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function buildSnapshot(input: SalesforceOpportunityInput): OpportunitySnapshot {
  return {
    account: input.account,
    opportunity: input.opportunity,
    opportunity_link: input.opportunity_link,
    stage: input.stage,
    stage_bucket: inferStageBucket(input.stage),
    motion: inferMotion(input),
    ae_owner: input.ae_owner ?? null,
    experimentation_team_engaged: 'Unknown',
    ai_configs_adjacent: 'Unknown',
    competitive_mention: inferYesOrUnknown(input.competitor),
    competitive_detail: input.competitor ?? null,
    exec_sponsor_mentioned: inferYesOrUnknown(input.exec_sponsor),
    exec_sponsor_detail: input.exec_sponsor ?? null,
    next_checkpoint: inferNextCheckpoint(input.close_date),
  };
}

function inferStageBucket(stage: string): StageBucket {
  const s = stage.toLowerCase();
  if (s.includes('closed won') || s.startsWith('cw') || s.includes('closed lost') || s.startsWith('cl')) {
    return 'Closed';
  }
  if (s.includes('proposal') || s.includes('paper') || s.includes('eb approval')) {
    return 'Late';
  }
  if (s.includes('pov') || s.includes('value')) {
    return 'Mid';
  }
  return 'Early';
}

function inferMotion(input: SalesforceOpportunityInput): Motion {
  if (input.motion_hint) return input.motion_hint;

  const opp = input.opportunity.toLowerCase();
  if (opp.includes('renewal')) return 'Renewal';
  if (opp.includes('expansion') || opp.includes('enterprise tier') || opp.includes('multi-product')) {
    return 'Expansion';
  }
  return 'Net-new';
}

function inferYesOrUnknown(value: string | null | undefined): YesNoUnknown {
  return nonEmpty(value) ? 'Yes' : 'Unknown';
}

function inferNextCheckpoint(closeDate: string | null | undefined): string | null {
  if (typeof closeDate === 'string' && ISO_DATE.test(closeDate)) return closeDate;
  return null;
}

// ---------------------------------------------------------------------------
// Evidence generation
// ---------------------------------------------------------------------------

function buildEvidence(input: SalesforceOpportunityInput): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  const primarySnippet =
    nonEmpty(input.description) ? input.description!
    : firstNonEmpty(input.notes) ?? (
      nonEmpty(input.next_step) ? input.next_step!
      : `Salesforce opportunity record for ${input.opportunity}`
    );

  items.push({
    source_type: 'Salesforce',
    source_link: input.opportunity_link,
    timestamp: null,
    snippet: primarySnippet,
  });

  if (input.notes) {
    let added = 0;
    for (const note of input.notes) {
      if (added >= 2) break;
      if (!note || note.trim().length === 0) continue;
      if (note === primarySnippet) continue;
      items.push({
        source_type: 'Salesforce Note',
        source_link: `${input.opportunity_link}/notes/${added + 1}`,
        timestamp: null,
        snippet: note,
      });
      added++;
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Notes generation
// ---------------------------------------------------------------------------

function buildNotes(input: SalesforceOpportunityInput): string[] {
  const notes: string[] = [];
  if (input.notes) {
    for (const n of input.notes) {
      if (n && n.trim().length > 0) notes.push(n);
    }
  }
  notes.push('SCOUT_SOURCE=Salesforce');
  return notes;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

function firstNonEmpty(arr: string[] | null | undefined): string | null {
  if (!arr) return null;
  for (const s of arr) {
    if (s && s.trim().length > 0) return s;
  }
  return null;
}
