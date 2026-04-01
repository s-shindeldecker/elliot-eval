/**
 * Wisdom tool set — Enterpret Knowledge Graph tools for the AI Config Agent.
 *
 * Provides a WisdomToolRegistry that implements ToolRegistry, exposing all
 * Wisdom tools as OpenAI function definitions and dispatching calls.
 */

export { createWisdomClient } from './client.js';
export type { WisdomClient, WisdomClientConfig, WisdomQueryResult, WisdomSearchResult } from './client.js';

export type {
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
  GetSlackMentionsParams,
  SlackMention,
} from './types.js';

export {
  SEARCH_ACCOUNT_SCHEMA,
  GET_RECENT_CALLS_SCHEMA,
  GET_CALL_DETAILS_SCHEMA,
  GET_SUPPORT_TICKETS_SCHEMA,
  GET_ACCOUNT_FEEDBACK_SCHEMA,
  GET_SLACK_MENTIONS_SCHEMA,
} from './types.js';

import type { ToolDefinition, ToolResult, ToolRegistry } from '../types.js';
import type { WisdomClient } from './client.js';
import {
  SEARCH_ACCOUNT_SCHEMA,
  GET_RECENT_CALLS_SCHEMA,
  GET_CALL_DETAILS_SCHEMA,
  GET_SUPPORT_TICKETS_SCHEMA,
  GET_ACCOUNT_FEEDBACK_SCHEMA,
  GET_SLACK_MENTIONS_SCHEMA,
} from './types.js';
import type {
  SearchAccountParams,
  GetRecentCallsParams,
  GetCallDetailsParams,
  GetSupportTicketsParams,
  GetAccountFeedbackParams,
  GetSlackMentionsParams,
} from './types.js';
import {
  searchAccount,
  getRecentCalls,
  getCallDetails,
  getSupportTickets,
  getAccountFeedback,
  getSlackMentions,
} from './tools.js';

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export class WisdomToolRegistry implements ToolRegistry {
  private client: WisdomClient;

  constructor(client: WisdomClient) {
    this.client = client;
  }

  definitions(): ToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'search_account',
          description:
            'Search for accounts by name in the knowledge graph. ' +
            'Returns matching accounts with Salesforce IDs, type, ARR, industry, owner, and lifecycle stage. ' +
            'Duplicate accounts with the same name are auto-merged, keeping the richest record. ' +
            'Handles partial matches — useful for fuzzy lookups.',
          parameters: SEARCH_ACCOUNT_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_recent_calls',
          description:
            'Get recent Gong calls for an account. Returns call titles, dates, participants, ' +
            'and linked Salesforce opportunity names. Use to understand recent engagement.',
          parameters: GET_RECENT_CALLS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_call_details',
          description:
            'Get detailed content for a specific Gong call by its ID. Returns the full ' +
            'transcript/content, participants, and linked opportunity details.',
          parameters: GET_CALL_DETAILS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_support_tickets',
          description:
            'Get recent Zendesk support tickets for an account. Returns ticket status, ' +
            'type, channel, satisfaction rating, and content.',
          parameters: GET_SUPPORT_TICKETS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_account_feedback',
          description:
            'Get aggregated feedback insights for an account across all sources. ' +
            'Returns theme breakdown (complaints, praise, improvement requests) and source distribution.',
          parameters: GET_ACCOUNT_FEEDBACK_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_slack_mentions',
          description:
            'Get recent Slack messages mentioning an account. Returns channel, author, ' +
            'content, and date for internal conversations about the account.',
          parameters: GET_SLACK_MENTIONS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    ];
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (name) {
        case 'search_account':
          return { data: await searchAccount(this.client, args as unknown as SearchAccountParams) };
        case 'get_recent_calls':
          return { data: await getRecentCalls(this.client, args as unknown as GetRecentCallsParams) };
        case 'get_call_details':
          return { data: await getCallDetails(this.client, args as unknown as GetCallDetailsParams) };
        case 'get_support_tickets':
          return { data: await getSupportTickets(this.client, args as unknown as GetSupportTicketsParams) };
        case 'get_account_feedback':
          return { data: await getAccountFeedback(this.client, args as unknown as GetAccountFeedbackParams) };
        case 'get_slack_mentions':
          return { data: await getSlackMentions(this.client, args as unknown as GetSlackMentionsParams) };
        default:
          return { data: null, error: `Unknown wisdom tool: ${name}` };
      }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
