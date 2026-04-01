/**
 * WisdomClient — abstraction over the Enterpret Knowledge Graph MCP server.
 *
 * Provides two core operations matching the Wisdom MCP tools:
 * - executeCypher: run a Cypher query against the KG
 * - searchKnowledgeGraph: natural language search across entities
 *
 * The default implementation uses the MCP SDK client. Connection details
 * (transport URL, auth token) are provided via WisdomClientConfig.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface WisdomQueryResult {
  success: boolean;
  row_count?: number;
  column_names?: string[];
  rows?: Record<string, unknown>[];
  error?: string;
}

export interface WisdomSearchResult {
  success: boolean;
  results?: Array<Record<string, unknown>>;
  total_count?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export interface WisdomClient {
  executeCypher(query: string, description?: string): Promise<WisdomQueryResult>;
  searchKnowledgeGraph(query: string, entityTypes?: string[], limit?: number): Promise<WisdomSearchResult>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WisdomClientConfig {
  /** MCP server URL (SSE or StreamableHTTP endpoint) */
  serverUrl: string;
  /** Bearer token for authentication */
  authToken?: string;
  /** Transport type — defaults to 'streamable-http', falls back to 'sse' */
  transport?: 'streamable-http' | 'sse';
}

// ---------------------------------------------------------------------------
// MCP SDK implementation
// ---------------------------------------------------------------------------

interface TextContentItem {
  type: 'text';
  text: string;
}

function extractTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((c: unknown): c is TextContentItem =>
      typeof c === 'object' && c !== null && (c as Record<string, unknown>).type === 'text',
    )
    .map((c: TextContentItem) => c.text)
    .join('\n');
}

/**
 * The Wisdom MCP server wraps its response in an envelope:
 *   { _meta, content, structuredContent: { actual data }, isError }
 *
 * The MCP SDK places this envelope in result.structuredContent, giving us
 * double nesting. This helper unwraps to the actual data payload.
 */
function unwrapStructuredContent<T>(sc: unknown): T | undefined {
  if (!sc || typeof sc !== 'object') return undefined;
  const outer = sc as Record<string, unknown>;
  if (outer.structuredContent && typeof outer.structuredContent === 'object') {
    return outer.structuredContent as T;
  }
  return sc as T;
}

export class McpWisdomClient implements WisdomClient {
  private client: Client | undefined;
  private config: WisdomClientConfig;
  private connectPromise: Promise<void> | undefined;

  constructor(config: WisdomClientConfig) {
    this.config = config;
  }

  private async ensureConnected(): Promise<Client> {
    if (this.client) return this.client;

    if (!this.connectPromise) {
      this.connectPromise = this.connect();
    }
    await this.connectPromise;
    return this.client!;
  }

  private async connect(): Promise<void> {
    const url = new URL(this.config.serverUrl);
    const headers: Record<string, string> = {};
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    const transportType = this.config.transport ?? 'streamable-http';
    const transport = transportType === 'sse'
      ? new SSEClientTransport(url, { requestInit: { headers } })
      : new StreamableHTTPClientTransport(url, { requestInit: { headers } });

    this.client = new Client({ name: 'elliot-wisdom', version: '1.0.0' });
    await this.client.connect(transport);
  }

  async executeCypher(query: string, description = 'Executing query'): Promise<WisdomQueryResult> {
    const client = await this.ensureConnected();

    const result = await client.callTool({
      name: 'execute_cypher_query',
      arguments: { cypher_query: query, description },
    });

    const asRecord = result as Record<string, unknown>;
    if (asRecord.isError) {
      return { success: false, error: extractTextFromContent(asRecord.content) || 'Unknown error' };
    }

    const unwrapped = unwrapStructuredContent<WisdomQueryResult>(asRecord.structuredContent);
    if (unwrapped?.success !== undefined) return unwrapped;

    const textContent = extractTextFromContent(asRecord.content);
    try {
      const parsed = JSON.parse(textContent);
      const inner = unwrapStructuredContent<WisdomQueryResult>(parsed);
      return inner?.success !== undefined ? inner : (parsed as WisdomQueryResult);
    } catch {
      return { success: true, rows: [], row_count: 0, column_names: [], error: textContent || undefined };
    }
  }

  async searchKnowledgeGraph(
    query: string,
    entityTypes?: string[],
    limit = 10,
  ): Promise<WisdomSearchResult> {
    const client = await this.ensureConnected();

    const args: Record<string, unknown> = { query, limit };
    if (entityTypes) args.entity_types = entityTypes;

    const result = await client.callTool({
      name: 'search_knowledge_graph',
      arguments: args,
    });

    const asRecord = result as Record<string, unknown>;
    if (asRecord.isError) {
      return { success: false, error: extractTextFromContent(asRecord.content) || 'Unknown error' };
    }

    const unwrapped = unwrapStructuredContent<WisdomSearchResult>(asRecord.structuredContent);
    if (unwrapped?.success !== undefined) return unwrapped;

    const textContent = extractTextFromContent(asRecord.content);
    try {
      const parsed = JSON.parse(textContent);
      const inner = unwrapStructuredContent<WisdomSearchResult>(parsed);
      return inner?.success !== undefined ? inner : (parsed as WisdomSearchResult);
    } catch {
      return { success: true, results: [], total_count: 0 };
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = undefined;
      this.connectPromise = undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWisdomClient(config: WisdomClientConfig): WisdomClient {
  return new McpWisdomClient(config);
}
