/**
 * Common tool types shared across all tool sets (Wisdom, Salesforce, etc.).
 *
 * Each tool is defined by a ToolDefinition (for the OpenAI function calling spec)
 * and an async execute function. The AI Config Agent uses these to register
 * tools and dispatch function calls.
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolResult {
  data: unknown;
  error?: string;
}

export interface ToolRegistry {
  definitions(): ToolDefinition[];
  execute(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}
