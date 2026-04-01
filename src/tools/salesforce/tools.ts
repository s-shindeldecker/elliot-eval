/**
 * Salesforce tool implementations.
 *
 * All tools are stubs that throw until Salesforce API credentials are
 * configured. The SalesforceApiClient is injected at construction time;
 * when null, tools return a clear "not connected" message instead of
 * throwing, so the agent can gracefully inform the user.
 */

import type { SalesforceApiClient } from './types.js';

const NOT_CONNECTED =
  'Salesforce API is not connected. This tool is unavailable — do not retry. Respond using other available tools or inform the user that Salesforce data is not currently accessible.';

export async function queryOpportunity(
  _client: SalesforceApiClient | null,
  params: { opportunity_id: string },
): Promise<unknown> {
  if (!_client) return { error: NOT_CONNECTED, opportunity_id: params.opportunity_id };
  throw new Error(`queryOpportunity not yet implemented for live API (opp=${params.opportunity_id})`);
}

export async function searchAccounts(
  _client: SalesforceApiClient | null,
  params: { query: string; limit?: number },
): Promise<unknown> {
  if (!_client) return { error: NOT_CONNECTED, query: params.query };
  throw new Error(`searchAccounts not yet implemented for live API (query=${params.query})`);
}

export async function searchActivities(
  _client: SalesforceApiClient | null,
  params: { opportunity_id: string; limit?: number },
): Promise<unknown> {
  if (!_client) return { error: NOT_CONNECTED, opportunity_id: params.opportunity_id };
  throw new Error(`searchActivities not yet implemented for live API (opp=${params.opportunity_id})`);
}

export async function fetchContacts(
  _client: SalesforceApiClient | null,
  params: { opportunity_id: string },
): Promise<unknown> {
  if (!_client) return { error: NOT_CONNECTED, opportunity_id: params.opportunity_id };
  throw new Error(`fetchContacts not yet implemented for live API (opp=${params.opportunity_id})`);
}
