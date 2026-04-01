/**
 * Parameter and result types for Wisdom (Enterpret KG) tools,
 * plus JSON Schemas for OpenAI function calling.
 */

// ---------------------------------------------------------------------------
// search_account
// ---------------------------------------------------------------------------

export interface SearchAccountParams {
  query: string;
  limit?: number;
}

export interface AccountResult {
  record_id: string;
  name: string;
  salesforce_id?: string;
  arr?: number;
  lifecycle_stage?: string;
  icp_rank?: number;
  industry?: string;
}

export const SEARCH_ACCOUNT_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Account name to search for. Handles partial matches and typos.',
    },
    limit: {
      type: 'integer',
      description: 'Max results to return (default 5).',
      default: 5,
    },
  },
  required: ['query'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// get_recent_calls
// ---------------------------------------------------------------------------

export interface GetRecentCallsParams {
  account_name: string;
  days?: number;
  limit?: number;
}

export interface CallSummary {
  call_id: string;
  title: string;
  date: string;
  participants: string[];
  opportunity_name?: string;
  opportunity_stage?: string;
  opportunity_amount?: number;
}

export const GET_RECENT_CALLS_SCHEMA = {
  type: 'object',
  properties: {
    account_name: {
      type: 'string',
      description: 'Account name to find Gong calls for.',
    },
    days: {
      type: 'integer',
      description: 'Look back this many days (default 30).',
      default: 30,
    },
    limit: {
      type: 'integer',
      description: 'Max calls to return (default 10).',
      default: 10,
    },
  },
  required: ['account_name'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// get_call_details
// ---------------------------------------------------------------------------

export interface GetCallDetailsParams {
  call_id: string;
}

export interface CallDetail {
  call_id: string;
  title: string;
  date: string;
  participants: string[];
  content: string;
  opportunity_name?: string;
  opportunity_stage?: string;
  opportunity_amount?: number;
  account_name?: string;
  external_link?: string;
}

export const GET_CALL_DETAILS_SCHEMA = {
  type: 'object',
  properties: {
    call_id: {
      type: 'string',
      description: 'The origin_record_id of the Gong call to retrieve details for.',
    },
  },
  required: ['call_id'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// get_support_tickets
// ---------------------------------------------------------------------------

export interface GetSupportTicketsParams {
  account_name: string;
  days?: number;
  limit?: number;
}

export interface SupportTicket {
  record_id: string;
  status?: string;
  priority?: string;
  type?: string;
  channel?: string;
  satisfaction?: string;
  content: string;
  date: string;
}

export const GET_SUPPORT_TICKETS_SCHEMA = {
  type: 'object',
  properties: {
    account_name: {
      type: 'string',
      description: 'Account name to find Zendesk support tickets for.',
    },
    days: {
      type: 'integer',
      description: 'Look back this many days (default 90).',
      default: 90,
    },
    limit: {
      type: 'integer',
      description: 'Max tickets to return (default 10).',
      default: 10,
    },
  },
  required: ['account_name'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// get_account_feedback
// ---------------------------------------------------------------------------

export interface GetAccountFeedbackParams {
  account_name: string;
  days?: number;
}

export interface FeedbackThemeSummary {
  theme: string;
  category: string;
  total: number;
}

export interface AccountFeedbackResult {
  account_name: string;
  themes: FeedbackThemeSummary[];
  source_breakdown: Array<{ source: string; total: number }>;
}

export const GET_ACCOUNT_FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    account_name: {
      type: 'string',
      description: 'Account name to retrieve aggregated feedback insights for.',
    },
    days: {
      type: 'integer',
      description: 'Look back this many days (default 90).',
      default: 90,
    },
  },
  required: ['account_name'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// get_slack_mentions
// ---------------------------------------------------------------------------

export interface GetSlackMentionsParams {
  account_name: string;
  days?: number;
  limit?: number;
}

export interface SlackMention {
  record_id: string;
  channel?: string;
  author?: string;
  content: string;
  date: string;
}

export const GET_SLACK_MENTIONS_SCHEMA = {
  type: 'object',
  properties: {
    account_name: {
      type: 'string',
      description: 'Account name to find Slack mentions for.',
    },
    days: {
      type: 'integer',
      description: 'Look back this many days (default 90). Slack volume is low so a wider window is recommended.',
      default: 90,
    },
    limit: {
      type: 'integer',
      description: 'Max mentions to return (default 15).',
      default: 15,
    },
  },
  required: ['account_name'],
  additionalProperties: false,
} as const;
