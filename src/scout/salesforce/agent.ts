/**
 * SalesforceScoutAgent — LD AI Config-managed agent for Salesforce data.
 *
 * Uses Salesforce-specific tools (query_opportunity, search_activities,
 * fetch_contacts) to gather evidence and produce a ScoutContribution.
 *
 * Currently a scaffold: tool implementations throw "not connected" errors.
 * The deterministic mapper (map-record-to-bundle.ts) remains the active
 * path for fixture-based evaluation. This agent will be wired up when
 * Salesforce API credentials and the LD AI Config tool-use extension
 * are available.
 */

import type {
  ScoutAgent,
  ScoutContext,
  ScoutContribution,
  ScoutTool,
  ScoutToolResult,
} from '../types.js';
import {
  QUERY_OPPORTUNITY_SCHEMA,
  SEARCH_ACTIVITIES_SCHEMA,
  FETCH_CONTACTS_SCHEMA,
} from './tools/types.js';

// ---------------------------------------------------------------------------
// Tool implementations (stubs — not connected to Salesforce API)
// ---------------------------------------------------------------------------

class QueryOpportunityTool implements ScoutTool {
  readonly name = 'query_opportunity';
  readonly description =
    'Fetch the core Salesforce opportunity record including account, stage, owner, ' +
    'financials, and custom fields. Returns structured opportunity data.';
  readonly parameters = QUERY_OPPORTUNITY_SCHEMA;

  async execute(_args: Record<string, unknown>): Promise<ScoutToolResult> {
    throw new Error(
      `[${this.name}] Not connected to Salesforce API. ` +
      'Configure SalesforceAuthConfig to enable live queries.',
    );
  }
}

class SearchActivitiesTool implements ScoutTool {
  readonly name = 'search_activities';
  readonly description =
    'Search the activity history (Tasks, Events, Chatter) for a Salesforce opportunity. ' +
    'Returns recent activities with subject, description, and date.';
  readonly parameters = SEARCH_ACTIVITIES_SCHEMA;

  async execute(_args: Record<string, unknown>): Promise<ScoutToolResult> {
    throw new Error(
      `[${this.name}] Not connected to Salesforce API. ` +
      'Configure SalesforceAuthConfig to enable live queries.',
    );
  }
}

class FetchContactsTool implements ScoutTool {
  readonly name = 'fetch_contacts';
  readonly description =
    'Fetch contacts related to a Salesforce opportunity, including their titles and roles. ' +
    'Useful for identifying executive sponsors and champions.';
  readonly parameters = FETCH_CONTACTS_SCHEMA;

  async execute(_args: Record<string, unknown>): Promise<ScoutToolResult> {
    throw new Error(
      `[${this.name}] Not connected to Salesforce API. ` +
      'Configure SalesforceAuthConfig to enable live queries.',
    );
  }
}

// ---------------------------------------------------------------------------
// SalesforceScoutAgent
// ---------------------------------------------------------------------------

export interface SalesforceScoutAgentConfig {
  aiConfigKey: string;
}

export class SalesforceScoutAgent implements ScoutAgent {
  readonly source = 'salesforce';
  readonly aiConfigKey: string;
  readonly tools: readonly ScoutTool[];

  constructor(config: SalesforceScoutAgentConfig) {
    this.aiConfigKey = config.aiConfigKey;
    this.tools = [
      new QueryOpportunityTool(),
      new SearchActivitiesTool(),
      new FetchContactsTool(),
    ];
  }

  /**
   * Run the Salesforce Scout agent for a given opportunity.
   *
   * Future implementation will:
   * 1. Retrieve LD AI Config (prompt, model, parameters)
   * 2. Call OpenAI with function definitions from this.tools
   * 3. Handle tool_calls in an agent loop (call tool → return result → repeat)
   * 4. Parse the model's final response into a ScoutContribution
   *
   * Currently throws — use the deterministic mapper for fixture-based evaluation.
   */
  async scout(context: ScoutContext): Promise<ScoutContribution> {
    throw new Error(
      `[SalesforceScoutAgent] Agentic scouting not yet implemented. ` +
      `Use mapSalesforceRecordToBundle() for fixture-based evaluation. ` +
      `(opportunity_id=${context.opportunity_id})`,
    );
  }

  /**
   * Returns OpenAI-compatible function definitions for all registered tools.
   * Used when calling the LD AI Config with tool use enabled.
   */
  getToolDefinitions(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    return this.tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Dispatch a tool call by name. Used in the agent loop when the model
   * requests a function call.
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<ScoutToolResult> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      return { data: null, error: `Unknown tool: ${name}` };
    }
    return tool.execute(args);
  }
}
