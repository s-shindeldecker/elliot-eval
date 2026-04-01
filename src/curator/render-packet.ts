import type { SignalBundle } from '../types/signal-bundle.js';

/**
 * Deterministic renderer: converts a SignalBundle into the evaluator's
 * input_text packet format. Output is stable across runs for the same input.
 */
export function renderPacket(bundle: SignalBundle): string {
  const lines: string[] = [];

  lines.push(bundle.title);
  lines.push('');
  lines.push('OPPORTUNITY SNAPSHOT');

  const s = bundle.snapshot;
  lines.push(`- EIC ID (if updating): ${blank(s.eic_id)}`);
  lines.push(`- Account: ${s.account}`);
  lines.push(`- Opportunity: ${s.opportunity}`);
  lines.push(`- Opportunity Link: ${blank(s.opportunity_link)}`);
  lines.push(`- Stage: ${blank(s.stage)}`);
  lines.push(`- Stage Bucket: ${blank(s.stage_bucket)}`);
  lines.push(`- Motion: ${blank(s.motion)}`);
  lines.push(`- AE Owner: ${blank(s.ae_owner)}`);
  lines.push(`- Experimentation Team Engaged?: ${blank(s.experimentation_team_engaged)}`);
  lines.push(`- AI Configs Adjacent?: ${blank(s.ai_configs_adjacent)}`);
  lines.push(`- Competitive Mention?: ${formatWithDetail(s.competitive_mention, s.competitive_detail)}`);
  lines.push(`- Exec Sponsor Mentioned?: ${formatWithDetail(s.exec_sponsor_mentioned, s.exec_sponsor_detail)}`);
  lines.push(`- Next Checkpoint: ${blank(s.next_checkpoint)}`);
  lines.push(`- Amount: ${formatCurrency(s.amount)}`);
  lines.push(`- Expected Revenue: ${formatCurrency(s.expected_revenue)}`);
  lines.push(`- Probability: ${s.probability != null ? `${s.probability}%` : ''}`);
  lines.push(`- Account Type: ${blank(s.account_type)}`);
  lines.push(`- ARR: ${formatCurrency(s.arr)}`);
  lines.push(`- Industry: ${blank(s.industry)}`);
  lines.push(`- Account Owner: ${blank(s.owner)}`);
  lines.push(`- Lifecycle Stage: ${blank(s.lifecycle_stage)}`);

  lines.push('');
  lines.push('EVIDENCE');

  for (let i = 0; i < bundle.evidence.length; i++) {
    const ev = bundle.evidence[i];
    if (i > 0) lines.push('');
    lines.push(`${i + 1}) Source Type: ${ev.source_type}`);
    if (ev.source_link) {
      lines.push(`  Source Link: ${ev.source_link}`);
    }
    lines.push(`  Source ID: ${ev.source_id}`);
    if (ev.timestamp != null && ev.timestamp.length > 0) {
      lines.push(`  Timestamp: ${ev.timestamp}`);
    }
    lines.push(`  Snippet: "${escapeQuotes(ev.snippet)}"`);
  }

  if (bundle.notes != null && bundle.notes.length > 0) {
    lines.push('');
    lines.push('NOTES');
    for (const note of bundle.notes) {
      lines.push(`- ${note}`);
    }
  }

  if (bundle.feedbackTrajectory) {
    const ft = bundle.feedbackTrajectory;
    lines.push('');
    lines.push('FEEDBACK TRAJECTORY');
    lines.push(`- Trend: ${ft.trend}`);
    lines.push(`- ${ft.summary}`);
  }

  lines.push('');
  return lines.join('\n');
}

function blank(value: string | null | undefined): string {
  if (value == null || value.length === 0) return '';
  return value;
}

function formatWithDetail(
  flag: string | null | undefined,
  detail: string | null | undefined,
): string {
  const base = blank(flag);
  if (base.length === 0) return '';
  if (detail != null && detail.length > 0) return `${base} (${detail})`;
  return base;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function escapeQuotes(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
