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
    motion: inferMotion(r),
    ae_owner: r.ownerName ?? null,
    experimentation_team_engaged: inferExperimentationEngaged(r),
    ai_configs_adjacent: inferAiConfigsAdjacent(r),
    competitive_mention: yesOrUnknown(r.competitor),
    competitive_detail: buildCompetitiveDetail(r),
    exec_sponsor_mentioned: yesOrUnknown(r.execSponsor),
    exec_sponsor_detail: r.execSponsor ?? null,
    next_checkpoint: validDate(r.closeDate),
    amount: r.amount ?? null,
    expected_revenue: r.expectedRevenue ?? null,
    probability: r.probability ?? null,
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

function inferMotion(r: SalesforceOpportunityRecord): Motion {
  if (nonEmpty(r.dealType)) {
    const dt = r.dealType!.toLowerCase();
    if (dt === 'expansion') return 'Expansion';
    if (dt === 'renewal') return 'Renewal';
  }
  const lower = r.opportunityName.toLowerCase();
  if (lower.includes('renewal')) return 'Renewal';
  if (lower.includes('expansion') || lower.includes('enterprise tier') || lower.includes('multi-product')) {
    return 'Expansion';
  }
  return 'Net-new';
}

function inferExperimentationEngaged(r: SalesforceOpportunityRecord): YesNoUnknown {
  if (r.launchX === true) return 'Yes';
  if (r.launchX === false) return 'No';
  return 'Unknown';
}

function inferAiConfigsAdjacent(r: SalesforceOpportunityRecord): YesNoUnknown {
  const haystack = [
    r.description, r.launchXNotes, r.nextStepsDetails, r.businessImpactNotes,
    ...(r.notes ?? []),
  ].filter(nonEmpty).join(' ').toLowerCase();
  if (haystack.includes('ai config') || haystack.includes('ai-config') || haystack.includes('guardian')) {
    return 'Yes';
  }
  return 'Unknown';
}

function buildCompetitiveDetail(r: SalesforceOpportunityRecord): string | null {
  const parts: string[] = [];
  if (nonEmpty(r.competitor)) parts.push(r.competitor!);
  if (nonEmpty(r.competitionNotes)) parts.push(r.competitionNotes!);
  return parts.length > 0 ? parts.join(' — ') : null;
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

  if (nonEmpty(r.nextStepsDetails) && r.nextStepsDetails !== primarySnippet) {
    items.push({
      source_type: 'Salesforce Activity',
      source_link: `${r.opportunityUrl}/activities`,
      timestamp: null,
      snippet: r.nextStepsDetails!,
    });
  }

  if (nonEmpty(r.businessImpactNotes) && r.businessImpactNotes !== primarySnippet) {
    items.push({
      source_type: 'Business Impact',
      source_link: `${r.opportunityUrl}/impact`,
      timestamp: null,
      snippet: r.businessImpactNotes!,
    });
  }

  if (nonEmpty(r.launchXNotes)) {
    items.push({
      source_type: 'LaunchX',
      source_link: `${r.opportunityUrl}/launchx`,
      timestamp: null,
      snippet: r.launchXNotes!,
    });
  }

  if (nonEmpty(r.competitionNotes)) {
    items.push({
      source_type: 'Competition Intel',
      source_link: `${r.opportunityUrl}/competition`,
      timestamp: null,
      snippet: r.competitionNotes!,
    });
  }

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
  if (nonEmpty(r.nextStepsDetails)) notes.push(`NEXT_STEPS: ${r.nextStepsDetails}`);
  if (nonEmpty(r.businessImpactNotes)) notes.push(`BUSINESS_IMPACT: ${r.businessImpactNotes}`);
  if (nonEmpty(r.launchXNotes)) notes.push(`LAUNCHX: ${r.launchXNotes}`);
  if (nonEmpty(r.competitionNotes)) notes.push(`COMPETITION: ${r.competitionNotes}`);
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
