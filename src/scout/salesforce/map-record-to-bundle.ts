/**
 * Maps a raw SalesforceOpportunityRecord into a validated SignalBundle.
 *
 * Conservative defaults: uncertain fields are "Unknown" or null.
 * No decisioning — this is pure data mapping.
 */

import type { SignalBundle, EvidenceItem, OpportunitySnapshot } from '../../types/signal-bundle.js';
import type { StageBucket, Motion, YesNoUnknown } from '../../shared/enums.js';
import type { SalesforceOpportunityRecord } from './types.js';

export function mapSalesforceRecordToBundle(record: SalesforceOpportunityRecord): SignalBundle {
  return {
    id: `sf-${record.id}`,
    title: `Salesforce Scout v1 — ${record.opportunityName}`,
    snapshot: buildSnapshot(record),
    evidence: buildEvidence(record),
    notes: buildNotes(record),
  };
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function buildSnapshot(r: SalesforceOpportunityRecord): OpportunitySnapshot {
  return {
    account: r.accountName,
    opportunity: r.opportunityName,
    opportunity_link: r.opportunityUrl,
    stage: r.stageName,
    stage_bucket: inferStageBucket(r.stageName),
    motion: inferMotion(r.opportunityName),
    ae_owner: r.ownerName ?? null,
    experimentation_team_engaged: 'Unknown',
    ai_configs_adjacent: 'Unknown',
    competitive_mention: yesOrUnknown(r.competitor),
    competitive_detail: r.competitor ?? null,
    exec_sponsor_mentioned: yesOrUnknown(r.execSponsor),
    exec_sponsor_detail: r.execSponsor ?? null,
    next_checkpoint: validDate(r.closeDate),
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

function inferMotion(oppName: string): Motion {
  const lower = oppName.toLowerCase();
  if (lower.includes('renewal')) return 'Renewal';
  if (lower.includes('expansion') || lower.includes('enterprise tier') || lower.includes('multi-product')) {
    return 'Expansion';
  }
  return 'Net-new';
}

function yesOrUnknown(value: string | null | undefined): YesNoUnknown {
  return nonEmpty(value) ? 'Yes' : 'Unknown';
}

function validDate(date: string | null | undefined): string | null {
  return typeof date === 'string' && ISO_DATE.test(date) ? date : null;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

function buildEvidence(r: SalesforceOpportunityRecord): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  const primarySnippet =
    nonEmpty(r.description) ? r.description!
    : firstNonEmpty(r.notes) ?? (
      nonEmpty(r.nextStep) ? r.nextStep!
      : `Salesforce opportunity record for ${r.opportunityName}`
    );

  items.push({
    source_type: 'Salesforce',
    source_link: r.opportunityUrl,
    timestamp: null,
    snippet: primarySnippet,
  });

  if (r.notes) {
    let added = 0;
    for (const note of r.notes) {
      if (added >= 2) break;
      if (!note || note.trim().length === 0) continue;
      if (note === primarySnippet) continue;
      items.push({
        source_type: 'Salesforce Note',
        source_link: `${r.opportunityUrl}/notes/${added + 1}`,
        timestamp: null,
        snippet: note,
      });
      added++;
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

function buildNotes(r: SalesforceOpportunityRecord): string[] {
  const notes: string[] = [];
  if (r.notes) {
    for (const n of r.notes) {
      if (n && n.trim().length > 0) notes.push(n);
    }
  }
  notes.push('SCOUT_SOURCE=Salesforce');
  notes.push('SCOUT_MODE=fixture');
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
