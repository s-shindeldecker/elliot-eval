/**
 * Wisdom tool implementations — each tool builds a Cypher query,
 * executes it via the WisdomClient, and transforms the results.
 *
 * Key Enterpret KG constraints discovered empirically:
 * - PROVIDED_BY_ACCOUNT relationships are unreliable; use source-specific
 *   account name fields (e.g. nli.gong_account_account_name) or content search
 * - ORDER BY must use full property paths, not column aliases
 * - Requesting non-existent properties silently returns 0 rows
 * - COUNT(DISTINCT nli.record_id) for counting
 * - CONTAINS for flexible string matching
 * - now() - INTERVAL N DAY for date ranges
 */

import type { WisdomClient } from './client.js';
import type {
  SearchAccountParams,
  AccountResult,
  GetRecentCallsParams,
  CallSummary,
  GetCallDetailsParams,
  CallDetail,
  GetSupportTicketsParams,
  SupportTicket,
  GetAccountFeedbackParams,
  AccountFeedbackResult,
  FeedbackThemeSummary,
  FeedbackTimelineItem,
  GetSlackMentionsParams,
  SlackMention,
} from './types.js';

type Row = Record<string, unknown>;

function str(val: unknown): string {
  if (val == null) return '';
  return String(val);
}

function num(val: unknown): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string' && val) return [val];
  return [];
}

// ---------------------------------------------------------------------------
// search_account
// ---------------------------------------------------------------------------

export async function searchAccount(
  client: WisdomClient,
  params: SearchAccountParams,
): Promise<AccountResult[]> {
  const limit = params.limit ?? 10;
  const escaped = escapeCypher(params.query);

  // Enriched query — includes metadata for disambiguation.
  // Falls back to basic query if KG returns 0 rows (properties that
  // don't exist on a node silently drop the entire row).
  const enrichedCypher = `
    MATCH (a:Account)
    WHERE a.salesforce_name CONTAINS '${escaped}'
    RETURN DISTINCT
      a.record_id AS record_id,
      a.salesforce_name AS name,
      a.salesforce_id AS salesforce_id,
      a.salesforce_type AS account_type,
      a.salesforce_arr_c AS arr,
      a.salesforce_industry AS industry,
      a.salesforce_account_owner_text_c AS owner,
      a.salesforce_customerlifecyclestage_c AS lifecycle_stage
    LIMIT ${limit * 2}
  `;

  const enrichedResult = await client.executeCypher(
    enrichedCypher,
    `Search accounts matching "${params.query}" (enriched)`,
  );

  if (enrichedResult.success && enrichedResult.rows?.length) {
    const raw: AccountResult[] = enrichedResult.rows.map((r: Row) => ({
      record_id: str(r.record_id),
      name: str(r.name),
      salesforce_id: str(r.salesforce_id) || undefined,
      account_type: str(r.account_type) || undefined,
      arr: num(r.arr),
      industry: str(r.industry) || undefined,
      owner: str(r.owner) || undefined,
      lifecycle_stage: str(r.lifecycle_stage) || undefined,
    }));
    return deduplicateAccounts(raw, limit);
  }

  // Fallback: basic query (always works — no optional SF properties)
  const basicCypher = `
    MATCH (a:Account)
    WHERE a.salesforce_name CONTAINS '${escaped}'
    RETURN DISTINCT
      a.record_id AS record_id,
      a.salesforce_name AS name,
      a.salesforce_id AS salesforce_id
    LIMIT ${limit}
  `;

  const basicResult = await client.executeCypher(
    basicCypher,
    `Search accounts matching "${params.query}" (basic)`,
  );
  if (!basicResult.success || !basicResult.rows) return [];

  return basicResult.rows.map((r: Row) => ({
    record_id: str(r.record_id),
    name: str(r.name),
    salesforce_id: str(r.salesforce_id) || undefined,
  }));
}

// ---------------------------------------------------------------------------
// get_recent_calls
// ---------------------------------------------------------------------------

export async function getRecentCalls(
  client: WisdomClient,
  params: GetRecentCallsParams,
): Promise<CallSummary[]> {
  const days = params.days ?? 30;
  const limit = params.limit ?? 10;

  const cypher = `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.gong_account_account_name CONTAINS '${escapeCypher(params.account_name)}'
      AND nli.record_timestamp >= now() - INTERVAL ${days} DAY
    RETURN
      nli.origin_record_id AS call_id,
      nli.gong_metadata_title AS title,
      nli.record_timestamp AS record_ts,
      nli.gong_parties_name AS participant,
      nli.gong_account_opportunity_name AS opp_name,
      nli.gong_account_opportunity_stagename AS opp_stage,
      nli.gong_account_opportunity_amount AS opp_amount
    ORDER BY nli.record_timestamp DESC
    LIMIT ${limit * 15}
  `;

  const result = await client.executeCypher(
    cypher,
    `Recent Gong calls for ${params.account_name}`,
  );
  if (!result.success || !result.rows) return [];

  const callMap = new Map<string, CallSummary>();
  for (const r of result.rows) {
    const callId = str(r.call_id);
    if (!callId) continue;

    const existing = callMap.get(callId);
    if (existing) {
      const participant = str(r.participant);
      if (participant && !existing.participants.includes(participant)) {
        existing.participants.push(participant);
      }
    } else {
      callMap.set(callId, {
        call_id: callId,
        title: str(r.title),
        date: str(r.record_ts),
        participants: toStringArray(r.participant),
        opportunity_name: str(r.opp_name) || undefined,
        opportunity_stage: str(r.opp_stage) || undefined,
        opportunity_amount: num(r.opp_amount),
      });
    }
  }

  return [...callMap.values()].slice(0, limit);
}

// ---------------------------------------------------------------------------
// get_call_details
// ---------------------------------------------------------------------------

export async function getCallDetails(
  client: WisdomClient,
  params: GetCallDetailsParams,
): Promise<CallDetail | null> {
  const cypher = `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.source = 'Gong'
      AND nli.origin_record_id = '${escapeCypher(params.call_id)}'
    RETURN
      nli.origin_record_id AS call_id,
      nli.gong_metadata_title AS title,
      nli.record_timestamp AS record_ts,
      nli.gong_parties_name AS participant,
      nli.content AS content,
      nli.gong_account_account_name AS account_name,
      nli.gong_account_opportunity_name AS opp_name,
      nli.gong_account_opportunity_stagename AS opp_stage,
      nli.gong_account_opportunity_amount AS opp_amount
    LIMIT 30
  `;

  const result = await client.executeCypher(
    cypher,
    `Details for Gong call ${params.call_id}`,
  );
  if (!result.success || !result.rows || result.rows.length === 0) return null;

  const participants: string[] = [];
  let content = '';
  const first = result.rows[0];

  for (const r of result.rows) {
    const p = str(r.participant);
    if (p && !participants.includes(p)) participants.push(p);
    const c = str(r.content);
    if (c && c.length > content.length) content = c;
  }

  return {
    call_id: str(first.call_id),
    title: str(first.title),
    date: str(first.record_ts),
    participants,
    content,
    account_name: str(first.account_name) || undefined,
    opportunity_name: str(first.opp_name) || undefined,
    opportunity_stage: str(first.opp_stage) || undefined,
    opportunity_amount: num(first.opp_amount),
  };
}

// ---------------------------------------------------------------------------
// get_support_tickets
// ---------------------------------------------------------------------------

export async function getSupportTickets(
  client: WisdomClient,
  params: GetSupportTicketsParams,
): Promise<SupportTicket[]> {
  const days = params.days ?? 90;
  const limit = params.limit ?? 10;

  const cypher = `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.source = 'Zendesk'
      AND nli.content CONTAINS '${escapeCypher(params.account_name)}'
      AND nli.record_timestamp >= now() - INTERVAL ${days} DAY
    RETURN DISTINCT
      nli.record_id AS record_id,
      nli.zendesksupport_status AS status,
      nli.content AS content,
      nli.record_timestamp AS record_ts
    ORDER BY nli.record_timestamp DESC
    LIMIT ${limit}
  `;

  const result = await client.executeCypher(
    cypher,
    `Support tickets for ${params.account_name}`,
  );
  if (!result.success || !result.rows) return [];

  return result.rows.map((r: Row) => ({
    record_id: str(r.record_id),
    status: str(r.status) || undefined,
    priority: undefined,
    type: undefined,
    channel: undefined,
    satisfaction: undefined,
    content: str(r.content),
    date: str(r.record_ts),
  }));
}

// ---------------------------------------------------------------------------
// get_account_feedback
// ---------------------------------------------------------------------------

export async function getAccountFeedback(
  client: WisdomClient,
  params: GetAccountFeedbackParams,
): Promise<AccountFeedbackResult> {
  const days = params.days ?? 90;
  const escaped = escapeCypher(params.account_name);

  const themeQuery = `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.gong_account_account_name CONTAINS '${escaped}'
      AND nli.record_timestamp >= now() - INTERVAL ${days} DAY
    MATCH (nli)-[:SUMMARIZED_BY]->(fi:FeedbackInsight)-[:HAS_TAGS]->(cft:CustomerFeedbackTags)-[:HAS_THEME]->(t:Theme)
    WHERE t.type != 'MISC'
    RETURN t.name AS theme, t.category_enum AS category, COUNT(DISTINCT nli.record_id) AS total
    LIMIT 20
  `;

  const sourceQuery = `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.gong_account_account_name CONTAINS '${escaped}'
      AND nli.record_timestamp >= now() - INTERVAL ${days} DAY
    RETURN nli.source AS source, COUNT(DISTINCT nli.record_id) AS total
    LIMIT 10
  `;

  const timelineQuery = `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.gong_account_account_name CONTAINS '${escaped}'
      AND nli.record_timestamp >= now() - INTERVAL ${days} DAY
    MATCH (nli)-[:SUMMARIZED_BY]->(fi:FeedbackInsight)-[:HAS_TAGS]->(cft:CustomerFeedbackTags)-[:HAS_THEME]->(t:Theme)
    WHERE t.type != 'MISC'
    RETURN t.name AS theme, t.category_enum AS category,
           nli.record_timestamp AS ts, nli.source AS source
    ORDER BY nli.record_timestamp ASC
    LIMIT 50
  `;

  const [themeResult, sourceResult, timelineResult] = await Promise.all([
    client.executeCypher(themeQuery, `Feedback themes for ${params.account_name}`),
    client.executeCypher(sourceQuery, `Feedback sources for ${params.account_name}`),
    client.executeCypher(timelineQuery, `Feedback timeline for ${params.account_name}`),
  ]);

  const themes: FeedbackThemeSummary[] = (themeResult.rows ?? []).map((r: Row) => ({
    theme: str(r.theme),
    category: str(r.category),
    total: num(r.total) ?? 0,
  }));

  const source_breakdown = (sourceResult.rows ?? []).map((r: Row) => ({
    source: str(r.source),
    total: num(r.total) ?? 0,
  }));

  const timeline: FeedbackTimelineItem[] = (timelineResult.rows ?? []).map((r: Row) => ({
    theme: str(r.theme),
    category: str(r.category),
    date: str(r.ts),
    source: str(r.source),
  }));

  return {
    account_name: params.account_name,
    themes,
    source_breakdown,
    timeline: timeline.length > 0 ? timeline : undefined,
  };
}

// ---------------------------------------------------------------------------
// get_slack_mentions
// ---------------------------------------------------------------------------

export async function getSlackMentions(
  client: WisdomClient,
  params: GetSlackMentionsParams,
): Promise<SlackMention[]> {
  const days = params.days ?? 90;
  const limit = params.limit ?? 15;
  const escaped = escapeCypher(params.account_name);

  // Derive slug for dedicated channel matching (e.g. "Jackbox Games" -> "jackbox")
  const slug = params.account_name.toLowerCase().split(/\s+/)[0];
  const escapedSlug = escapeCypher(slug);

  // Two-pronged search:
  // 1. Content mentions of the account name across ALL channels
  // 2. ALL messages from dedicated account-* or ext-* channels for this account
  const cypher = `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.source = 'Slack'
      AND nli.record_timestamp >= now() - INTERVAL ${days} DAY
      AND (
        nli.content CONTAINS '${escaped}'
        OR nli.slack_channel_name CONTAINS 'account-${escapedSlug}'
        OR nli.slack_channel_name CONTAINS 'ext-${escapedSlug}'
      )
    RETURN DISTINCT
      nli.record_id AS record_id,
      nli.slack_channel_name AS channel,
      nli.slack_author AS author,
      nli.content AS content,
      nli.record_timestamp AS record_ts
    ORDER BY nli.record_timestamp DESC
    LIMIT ${limit}
  `;

  const result = await client.executeCypher(
    cypher,
    `Slack mentions for ${params.account_name}`,
  );
  if (!result.success || !result.rows) return [];

  return result.rows.map((r: Row) => ({
    record_id: str(r.record_id),
    channel: str(r.channel) || undefined,
    author: str(r.author) || undefined,
    content: str(r.content),
    date: str(r.record_ts),
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * When multiple Account records share the same salesforce_name (common with
 * SF duplicates), keep only the richest record per name — the one with the
 * most populated metadata fields.  This prevents the Scout from presenting
 * indistinguishable options like 5 identical "Capital One" entries.
 */
function deduplicateAccounts(accounts: AccountResult[], limit: number): AccountResult[] {
  const byName = new Map<string, AccountResult[]>();
  for (const a of accounts) {
    const key = a.name.toLowerCase();
    const group = byName.get(key) ?? [];
    group.push(a);
    byName.set(key, group);
  }

  const richness = (a: AccountResult): number =>
    [a.account_type, a.industry, a.owner, a.lifecycle_stage].filter(Boolean).length
    + (a.arr != null && a.arr > 0 ? 2 : 0);

  const deduped: AccountResult[] = [];
  for (const group of byName.values()) {
    group.sort((a, b) => richness(b) - richness(a));
    deduped.push(group[0]);
  }

  return deduped.slice(0, limit);
}

function escapeCypher(value: string): string {
  return value.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}
