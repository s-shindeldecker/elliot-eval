/**
 * Deterministic Curator: transforms raw tool call results from the Scout agent
 * into a structured SignalBundle for the Judge.
 *
 * This function is pure and deterministic — same tool results in, same
 * SignalBundle out. No LLM involved.
 */

import type {
  SignalBundle,
  EvidenceItem,
  OpportunitySnapshot,
  StageBucket,
  YesNoUnknown,
} from '../types/signal-bundle.js';

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

interface AccountResult {
  record_id?: string;
  name?: string;
  salesforce_id?: string;
}

interface CallSummary {
  call_id?: string;
  title?: string;
  date?: string;
  participants?: string[];
  opportunity_name?: string;
  opportunity_stage?: string;
  opportunity_amount?: number;
}

interface CallDetail extends CallSummary {
  content?: string;
  account_name?: string;
}

interface SupportTicket {
  record_id?: string;
  status?: string;
  content?: string;
  date?: string;
}

interface SlackMention {
  record_id?: string;
  content?: string;
  date?: string;
  channel?: string;
  author?: string;
}

interface FeedbackTheme {
  theme?: string;
  category?: string;
  total?: number;
}

interface AccountFeedback {
  account_name?: string;
  themes?: FeedbackTheme[];
  source_breakdown?: Array<{ source?: string; total?: number }>;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function curateToolResults(
  accountName: string,
  toolCalls: ToolCall[],
): SignalBundle {
  const account = extractAccount(toolCalls);
  const calls = extractCalls(toolCalls);
  const callDetails = extractCallDetails(toolCalls);
  const tickets = extractTickets(toolCalls);
  const slackMentions = extractSlack(toolCalls);
  const feedback = extractFeedback(toolCalls);

  const allCalls: CallSummary[] = [...calls, ...callDetails];

  const evidence: EvidenceItem[] = [];

  for (const call of calls) {
    const detail = callDetails.find(d => d.call_id === call.call_id);
    const snippet = detail?.content
      ? truncate(detail.content, 500)
      : `${call.title ?? 'Gong call'} — Participants: ${(call.participants ?? []).join(', ')}`;

    evidence.push({
      source_type: 'Gong',
      source_link: `gong://call/${call.call_id ?? 'unknown'}`,
      timestamp: call.date ?? null,
      snippet,
    });
  }

  for (const ticket of tickets) {
    evidence.push({
      source_type: 'Zendesk',
      source_link: `zendesk://ticket/${ticket.record_id ?? 'unknown'}`,
      timestamp: ticket.date ?? null,
      snippet: truncate(ticket.content ?? `Ticket ${ticket.record_id} — Status: ${ticket.status ?? 'unknown'}`, 500),
    });
  }

  for (const mention of slackMentions) {
    evidence.push({
      source_type: 'Slack',
      source_link: `slack://message/${mention.record_id ?? 'unknown'}`,
      timestamp: mention.date ?? null,
      snippet: truncate(mention.content ?? 'Slack mention', 500),
    });
  }

  const notes: string[] = [];

  if (feedback) {
    for (const theme of feedback.themes ?? []) {
      if (theme.theme && theme.category) {
        notes.push(`[${theme.category}] ${theme.theme} (${theme.total ?? 0} mentions)`);
      }
    }

    if (feedback.source_breakdown?.length) {
      const sources = feedback.source_breakdown
        .map(s => `${s.source}: ${s.total}`)
        .join(', ');
      notes.push(`Source breakdown: ${sources}`);
    }
  }

  const resolvedName = account?.name ?? accountName;
  const now = new Date().toISOString().slice(0, 10);

  const oppData = inferOpportunityData(allCalls);
  const aeOwner = inferAeOwner(allCalls);
  const stageBucket = inferStageBucket(allCalls, oppData.opportunity);
  const experimentEngaged = inferExperimentationEngaged(allCalls);
  const aiConfigsAdj = inferAiConfigsAdjacent(feedback);
  const competitiveMention = inferCompetitiveMention(feedback);

  const snapshot: OpportunitySnapshot = {
    account: resolvedName,
    opportunity: oppData.opportunity ?? resolvedName,
    eic_id: account?.salesforce_id ?? null,
    stage: oppData.stage ?? null,
    stage_bucket: stageBucket,
    amount: oppData.amount ?? null,
    ae_owner: aeOwner,
    experimentation_team_engaged: experimentEngaged,
    ai_configs_adjacent: aiConfigsAdj,
    competitive_mention: competitiveMention,
  };

  return {
    id: `elliot-${slugify(resolvedName)}-${now}`,
    title: `ELLIOT Intelligence: ${resolvedName}`,
    snapshot,
    evidence,
    notes: notes.length > 0 ? notes : undefined,
  };
}

// ---------------------------------------------------------------------------
// Extractors — pull typed data from the untyped tool call results
// ---------------------------------------------------------------------------

function findResult<T>(toolCalls: ToolCall[], name: string): T | undefined {
  const tc = toolCalls.find(t => t.name === name);
  return tc?.result as T | undefined;
}

function findResults<T>(toolCalls: ToolCall[], name: string): T[] {
  const results: T[] = [];
  for (const tc of toolCalls) {
    if (tc.name === name && tc.result != null) {
      results.push(tc.result as T);
    }
  }
  return results;
}

function extractAccount(toolCalls: ToolCall[]): AccountResult | undefined {
  const accounts = findResult<AccountResult[]>(toolCalls, 'search_account');
  return Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : undefined;
}

function extractCalls(toolCalls: ToolCall[]): CallSummary[] {
  const calls = findResult<CallSummary[]>(toolCalls, 'get_recent_calls');
  return Array.isArray(calls) ? calls : [];
}

function extractCallDetails(toolCalls: ToolCall[]): CallDetail[] {
  const details = findResults<CallDetail | null>(toolCalls, 'get_call_details');
  return details.filter((d): d is CallDetail => d != null);
}

function extractTickets(toolCalls: ToolCall[]): SupportTicket[] {
  const tickets = findResult<SupportTicket[]>(toolCalls, 'get_support_tickets');
  return Array.isArray(tickets) ? tickets : [];
}

function extractSlack(toolCalls: ToolCall[]): SlackMention[] {
  const mentions = findResult<SlackMention[]>(toolCalls, 'get_slack_mentions');
  return Array.isArray(mentions) ? mentions : [];
}

function extractFeedback(toolCalls: ToolCall[]): AccountFeedback | undefined {
  return findResult<AccountFeedback>(toolCalls, 'get_account_feedback');
}

// ---------------------------------------------------------------------------
// Opportunity data from Gong Salesforce-linked fields
// ---------------------------------------------------------------------------

interface OppInferred {
  opportunity: string | null;
  stage: string | null;
  amount: number | null;
}

/**
 * Pick the most recent non-trial opportunity from calls.
 * Prefers opportunities whose stage is not "CW - Closed Won" with $0 amount
 * (those are typically trials), falling back to the first available.
 */
function inferOpportunityData(calls: CallSummary[]): OppInferred {
  const withOpp = calls.filter(c => c.opportunity_name);
  if (withOpp.length === 0) return { opportunity: null, stage: null, amount: null };

  const nonTrial = withOpp.find(
    c => !(c.opportunity_stage === 'CW - Closed Won' && (c.opportunity_amount ?? 0) === 0),
  );
  const best = nonTrial ?? withOpp[0];

  return {
    opportunity: best.opportunity_name ?? null,
    stage: best.opportunity_stage ?? null,
    amount: best.opportunity_amount ?? null,
  };
}

// ---------------------------------------------------------------------------
// AE owner — most-frequent participant across Gong calls
// ---------------------------------------------------------------------------

function inferAeOwner(calls: CallSummary[]): string | null {
  const counts = new Map<string, number>();
  for (const call of calls) {
    for (const p of call.participants ?? []) {
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;

  let topName = '';
  let topCount = 0;
  for (const [name, count] of counts) {
    if (count > topCount) {
      topName = name;
      topCount = count;
    }
  }
  return topName || null;
}

// ---------------------------------------------------------------------------
// Stage bucket — inferred from Salesforce stage string or call title keywords
// ---------------------------------------------------------------------------

const LATE_STAGE_PATTERNS = /quote|pricing|contract|negotiat|close|paper\s*process|order\s*form/i;
const MID_STAGE_PATTERNS = /pov|proof\s*of\s*value|demo|evaluat|technical\s*session/i;
const EARLY_STAGE_PATTERNS = /discovery|intro|first\s*call|validate\s*fit|qualification/i;
const CLOSED_STAGE_PATTERNS = /closed?\s*won|closed?\s*lost|cw\s*-|cl\s*-/i;

const BUCKET_RANK: Record<StageBucket, number> = {
  Early: 1,
  Mid: 2,
  Late: 3,
  Closed: 4,
};

function classifyStageString(stage: string): StageBucket | null {
  if (CLOSED_STAGE_PATTERNS.test(stage)) return 'Closed';
  if (LATE_STAGE_PATTERNS.test(stage)) return 'Late';
  if (/5\s*-|4\s*-/.test(stage)) return 'Late';
  if (MID_STAGE_PATTERNS.test(stage)) return 'Mid';
  if (/3\s*-/.test(stage)) return 'Mid';
  if (EARLY_STAGE_PATTERNS.test(stage)) return 'Early';
  if (/1\s*-|2\s*-/.test(stage)) return 'Early';
  return null;
}

/**
 * Pick the most advanced stage for the selected opportunity.
 * When an opportunity name is known, only considers calls linked to that opp.
 * Falls back to all calls if no opp name is provided, then to call title keywords.
 */
function inferStageBucket(calls: CallSummary[], selectedOpp: string | null): StageBucket | null {
  let best: StageBucket | null = null;

  // Scope to the selected opportunity when known
  const scopedCalls = selectedOpp
    ? calls.filter(c => c.opportunity_name === selectedOpp)
    : calls;

  for (const call of scopedCalls) {
    if (!call.opportunity_stage) continue;
    const bucket = classifyStageString(call.opportunity_stage);
    if (bucket && (best === null || BUCKET_RANK[bucket] > BUCKET_RANK[best])) {
      best = bucket;
    }
  }
  if (best) return best;

  // If no scoped match, try all calls
  if (selectedOpp && scopedCalls.length < calls.length) {
    for (const call of calls) {
      if (!call.opportunity_stage) continue;
      const bucket = classifyStageString(call.opportunity_stage);
      if (bucket && (best === null || BUCKET_RANK[bucket] > BUCKET_RANK[best])) {
        best = bucket;
      }
    }
    if (best) return best;
  }

  // Fall back to keyword matching on call titles
  const titles = calls.map(c => c.title ?? '').join(' ');
  if (LATE_STAGE_PATTERNS.test(titles)) return 'Late';
  if (MID_STAGE_PATTERNS.test(titles)) return 'Mid';
  if (EARLY_STAGE_PATTERNS.test(titles)) return 'Early';

  return null;
}

// ---------------------------------------------------------------------------
// Boolean flags from call titles and feedback themes
// ---------------------------------------------------------------------------

const EXPERIMENTATION_PATTERNS = /pov|proof\s*of\s*value|experiment|technical\s*session|a\/b\s*test/i;

function inferExperimentationEngaged(calls: CallSummary[]): YesNoUnknown {
  for (const call of calls) {
    if (EXPERIMENTATION_PATTERNS.test(call.title ?? '')) return 'Yes';
  }
  return 'Unknown';
}

function inferAiConfigsAdjacent(feedback: AccountFeedback | undefined): YesNoUnknown {
  if (!feedback?.themes) return 'Unknown';
  for (const theme of feedback.themes) {
    if (/ai\s*config/i.test(theme.theme ?? '')) return 'Yes';
  }
  return 'Unknown';
}

function inferCompetitiveMention(feedback: AccountFeedback | undefined): YesNoUnknown {
  if (!feedback?.themes) return 'No';
  for (const theme of feedback.themes) {
    if (/compet/i.test(theme.theme ?? '')) return 'Yes';
  }
  return 'No';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
