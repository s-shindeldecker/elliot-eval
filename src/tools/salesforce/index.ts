/**
 * Salesforce tool set for the AI Config Agent.
 *
 * Provides a SalesforceToolRegistry implementing ToolRegistry, exposing
 * Salesforce tools as OpenAI function definitions. Tools are stubs until
 * SalesforceApiClient credentials are configured.
 */

export type {
  SalesforceAuthConfig,
  SalesforceApiClient,
  SalesforceQueryResult,
  QueryOpportunityParams,
  QueryOpportunityResult,
  SearchAccountsParams,
  SalesforceAccountResult,
  SearchActivitiesParams,
  ActivityRecord,
  SearchActivitiesResult,
  FetchContactsParams,
  ContactRecord,
  FetchContactsResult,
} from './types.js';

export {
  QUERY_OPPORTUNITY_SCHEMA,
  SEARCH_ACCOUNTS_SCHEMA,
  SEARCH_ACTIVITIES_SCHEMA,
  FETCH_CONTACTS_SCHEMA,
} from './types.js';

import type { ToolDefinition, ToolResult, ToolRegistry } from '../types.js';
import type { SalesforceApiClient } from './types.js';
import {
  QUERY_OPPORTUNITY_SCHEMA,
  SEARCH_ACCOUNTS_SCHEMA,
  SEARCH_ACTIVITIES_SCHEMA,
  FETCH_CONTACTS_SCHEMA,
} from './types.js';
import {
  queryOpportunity,
  searchAccounts,
  searchActivities,
  fetchContacts,
} from './tools.js';

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export class SalesforceToolRegistry implements ToolRegistry {
  private client: SalesforceApiClient | null;

  constructor(client: SalesforceApiClient | null = null) {
    this.client = client;
  }

  definitions(): ToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'sf_query_opportunity',
          description:
            'Fetch a Salesforce opportunity record by ID. Returns stage, amount, owner, ' +
            'close date, next steps, and custom fields. This is the authoritative source ' +
            'for deal pipeline data.',
          parameters: QUERY_OPPORTUNITY_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      {
        type: 'function',
        function: {
          name: 'sf_search_accounts',
          description:
            'Search Salesforce accounts by name. Supports fuzzy matching via SOSL. ' +
            'Returns account ID, name, type, industry, and ARR.',
          parameters: SEARCH_ACCOUNTS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      {
        type: 'function',
        function: {
          name: 'sf_search_activities',
          description:
            'Search the activity history (Tasks, Events, Chatter) for a Salesforce opportunity. ' +
            'Returns recent activities with subject, description, and date.',
          parameters: SEARCH_ACTIVITIES_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      {
        type: 'function',
        function: {
          name: 'sf_fetch_contacts',
          description:
            'Fetch contacts related to a Salesforce opportunity, including their titles and roles. ' +
            'Useful for identifying executive sponsors and champions.',
          parameters: FETCH_CONTACTS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    ];
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (name) {
        case 'sf_query_opportunity':
          return { data: await queryOpportunity(this.client, args as unknown as { opportunity_id: string }) };
        case 'sf_search_accounts':
          return { data: await searchAccounts(this.client, args as unknown as { query: string; limit?: number }) };
        case 'sf_search_activities':
          return { data: await searchActivities(this.client, args as unknown as { opportunity_id: string; limit?: number }) };
        case 'sf_fetch_contacts':
          return { data: await fetchContacts(this.client, args as unknown as { opportunity_id: string }) };
        default:
          return { data: null, error: `Unknown salesforce tool: ${name}` };
      }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
