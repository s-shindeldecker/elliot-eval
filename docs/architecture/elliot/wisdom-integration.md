# Wisdom (Enterpret Knowledge Graph) Integration

## Overview

The Wisdom MCP provides access to the Enterpret Knowledge Graph — a unified data platform that normalizes and aggregates data from multiple customer-facing sources. ELLIOT uses this as its primary intelligence source, replacing the need for separate API integrations to each data platform.

## Data Sources Available

| Source | Entity Count | Key Data |
|--------|-------------|----------|
| **Gong** | ~12,500 records | Call transcripts, participant names/emails, opportunity linkage, account name, MEDDPICC fields |
| **Zendesk** | ~15,500 records | Support tickets, status, priority, satisfaction rating, channel |
| **Slack** | ~2,000 records | Internal messages with channel name, author |
| **Jira** | ~120 records | Feature requests, engineering tickets (via FileUpload) |
| **G2** | ~67 records | Public product reviews |

## Salesforce Linkage

Account nodes in the Knowledge Graph carry enriched Salesforce metadata:
- `salesforce_id`, `salesforce_name` — identity
- `salesforce_type` — account type (Customer, Prospect, etc.)
- `salesforce_arr_c` — annual recurring revenue
- `salesforce_industry` — industry vertical
- `salesforce_account_owner_text_c` — account owner name
- `salesforce_customerlifecyclestage_c` — lifecycle stage

Gong NLI records include `gong_account_opportunity_name`, `gong_account_opportunity_stagename`, and `gong_account_opportunity_amount` from Salesforce sync. This enables cross-source correlation: a Gong call can be tied to a Salesforce opportunity, which can be enriched with Zendesk ticket data for the same account.

The Curator flows enriched account metadata through to the Judge's OPPORTUNITY SNAPSHOT section, giving the Judge context on ARR, industry, and lifecycle stage without requiring a direct Salesforce API connection.

## ELLIOT Tools

Six Wisdom tools are available to the AI Config Agent:

### search_account
Find accounts by name (partial match via `CONTAINS`). Returns Salesforce IDs plus enriched metadata: account type, ARR, industry, owner, and lifecycle stage. Uses a two-query strategy: first attempts an enriched Cypher query requesting Salesforce properties, then falls back to a basic query (record_id, name, salesforce_id) if the KG returns 0 rows (Enterpret silently drops rows when requested properties don't exist on a node). Results are de-duplicated by name, keeping the record with the richest metadata per unique account name.

### get_recent_calls
Recent Gong calls for an account within a time window. Returns call titles, dates, participants, and Salesforce-linked opportunity data (name, stage, amount). The Curator uses these fields to infer the OpportunitySnapshot.

### get_call_details
Full content for a specific Gong call by `origin_record_id`. Returns the transcript, participants, account name, and all opportunity metadata. Key for evidence quality — summaries alone are not enough for strong Judge assessments.

### get_support_tickets
Recent Zendesk tickets for an account. Returns status and content. Matched by account name in ticket content via `CONTAINS`.

### get_account_feedback
Aggregated feedback insights across all sources. Runs three parallel Cypher queries:
1. **Theme query**: Returns feedback themes with categories (COMPLAINT, PRAISE, IMPROVEMENT, HELP) and mention counts
2. **Source query**: Returns source distribution (Gong, Zendesk, etc.)
3. **Timeline query**: Returns individual dated feedback items with theme, category, timestamp, and source — used by the Curator to compute feedback trajectory (improving/declining/stable trend)

### get_slack_mentions
Recent internal Slack messages referencing an account. Uses a two-pronged search: (1) content mentions of the account name across all channels, and (2) all messages from dedicated `account-{slug}` or `ext-{slug}` channels (case-insensitive slug derived from the first word of the account name). Returns channel name, author, content, and date. Default lookback is 90 days.

## Slack Channel Inventory

21 channels are indexed in the Knowledge Graph (as of March 2026):

| Category | Channels | Notes |
|----------|----------|-------|
| **Deal intelligence** | `newrevenue` (553), `ai-customer-calls` (120), `customer-insights` (112), `tech-customer-calls` (41) | Primary sources for internal deal discussion |
| **Competitive** | `competitors` (71) | Useful for `competitive_mention` signals |
| **Support** | `ask-support` (356), `ask-sdks` (93) | Internal support questions |
| **Key accounts** | `account-capital-one` (266), `account-rbc` (73) | Dedicated account channels |
| **External shared** | `ext-hireology` (107), `ext-flex` (92), `ext-fanatics` (37), `ext-figmaexperimentation-launchdarkly` (33), `ext-6sense` (26), `ext-figma` (23), `ext-hpe` (9), `ext-sanofi` (6), `ext-block-release-guardian` (6), `ext-launchdarkly-conga` (5), `ext-anzx` (3), `ext-atlassian` (2) | Customer-facing Slack Connect channels |

The `get_slack_mentions` tool searches content across all channels. For accounts with dedicated `account-*` or `ext-*` channels, all messages in those channels are relevant regardless of content match.

## Connection Architecture

ELLIOT connects to the Wisdom MCP server using the `@modelcontextprotocol/sdk` client library. The connection is configured via environment variables:

- `WISDOM_SERVER_URL` — MCP server endpoint (StreamableHTTP or SSE)
- `WISDOM_AUTH_TOKEN` — Bearer token for authentication

The `WisdomClient` interface (`src/tools/wisdom/client.ts`) abstracts the transport, enabling alternative implementations for testing.

## Cypher Query Patterns

All tools construct Cypher queries following the Enterpret KG usage guidelines:

- `CONTAINS` for flexible string matching (handles source name variations)
- `COUNT(DISTINCT nli.record_id)` for accurate counting (avoids duplicates from relationship traversals)
- `now() - INTERVAL N DAY` for date ranges
- Platform-aware LIMIT values with multipliers (e.g., `limit * 15` for Gong to accommodate per-participant rows)
- `type != 'MISC'` filter on taxonomy nodes (L1/L2/L3/Theme/Subtheme)
- `RETURN DISTINCT` to prevent duplicate rows from relationship traversals

Key discovery: `PROVIDED_BY_ACCOUNT` relationships are unreliable in the KG. Tools use source-specific account name fields instead:
```
# Gong calls — match by account name on the NLI node
MATCH (nli:NaturalLanguageInteraction)
WHERE nli.gong_account_account_name CONTAINS 'Acme'

# Account search — match on Account nodes directly
MATCH (a:Account)
WHERE a.salesforce_name CONTAINS 'Acme'
```

Another key constraint: requesting non-existent properties in a Cypher query silently returns 0 rows. The `search_account` tool handles this with a fallback query strategy.

## Future Enhancements

- **Feedback taxonomy analysis**: Use L1/L2/L3 taxonomy for product-area-specific analysis
- **Sentiment analysis**: Available for single-user sources (Zendesk, reviews) via SentimentPrediction nodes
- **Trend analysis**: Time-series queries using `toStartOfMonth()` for identifying patterns
- **Custom Cypher**: Allow the AI Config Agent to construct ad-hoc Cypher queries for novel questions
