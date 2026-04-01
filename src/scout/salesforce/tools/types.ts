/**
 * Salesforce-specific tool parameter and result types.
 *
 * These define the structured inputs/outputs for each Salesforce Scout tool.
 * The tools map to SOQL queries against the Salesforce REST API.
 */

// ---------------------------------------------------------------------------
// query_opportunity — fetch the core opportunity record
// ---------------------------------------------------------------------------

export interface QueryOpportunityParams {
  opportunity_id: string;
}

export interface QueryOpportunityResult {
  id: string;
  name: string;
  account_name: string;
  stage_name: string;
  owner_name: string | null;
  close_date: string | null;
  next_step: string | null;
  description: string | null;
  amount: number | null;
  expected_revenue: number | null;
  probability: number | null;
  type: string | null;
  lead_source: string | null;
  created_date: string | null;
  opportunity_url: string;
  custom_fields: Record<string, unknown>;
}

export const QUERY_OPPORTUNITY_SCHEMA = {
  type: 'object',
  properties: {
    opportunity_id: {
      type: 'string',
      description: 'The 15 or 18-character Salesforce Opportunity ID',
    },
  },
  required: ['opportunity_id'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// search_activities — fetch activity history (tasks, events, chatter)
// ---------------------------------------------------------------------------

export interface SearchActivitiesParams {
  opportunity_id: string;
  limit?: number;
}

export interface ActivityRecord {
  id: string;
  type: 'Task' | 'Event' | 'FeedItem';
  subject: string | null;
  description: string | null;
  date: string | null;
  owner_name: string | null;
}

export interface SearchActivitiesResult {
  activities: ActivityRecord[];
  total_count: number;
}

export const SEARCH_ACTIVITIES_SCHEMA = {
  type: 'object',
  properties: {
    opportunity_id: {
      type: 'string',
      description: 'The Salesforce Opportunity ID to search activities for',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of activities to return (default 20)',
    },
  },
  required: ['opportunity_id'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// fetch_contacts — who's involved (exec sponsors, champions)
// ---------------------------------------------------------------------------

export interface FetchContactsParams {
  opportunity_id: string;
}

export interface ContactRecord {
  id: string;
  name: string;
  title: string | null;
  role: string | null;
  is_primary: boolean;
  email: string | null;
}

export interface FetchContactsResult {
  contacts: ContactRecord[];
}

export const FETCH_CONTACTS_SCHEMA = {
  type: 'object',
  properties: {
    opportunity_id: {
      type: 'string',
      description: 'The Salesforce Opportunity ID to fetch related contacts for',
    },
  },
  required: ['opportunity_id'],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Salesforce API client types
// ---------------------------------------------------------------------------

export interface SalesforceAuthConfig {
  instance_url: string;
  access_token?: string;
  client_id?: string;
  client_secret?: string;
  username?: string;
  password?: string;
  auth_method: 'token' | 'oauth2_password' | 'oauth2_jwt';
}

export interface SalesforceApiClient {
  query<T = Record<string, unknown>>(soql: string): Promise<SalesforceQueryResult<T>>;
  getRecord<T = Record<string, unknown>>(sobject: string, id: string, fields?: string[]): Promise<T>;
}

export interface SalesforceQueryResult<T> {
  total_size: number;
  done: boolean;
  records: T[];
  next_records_url?: string;
}
