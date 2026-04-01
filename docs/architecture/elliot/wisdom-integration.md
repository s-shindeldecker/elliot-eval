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

Account nodes in the Knowledge Graph carry `salesforce_id` and `salesforce_name` properties. Gong records include `gong_account_opportunity_name`, `gong_account_opportunity_stagename`, and `gong_account_opportunity_amount`. This enables cross-source correlation: a Gong call can be tied to a Salesforce opportunity, which can be enriched with Zendesk ticket data for the same account.

## ELLIOT Tools

Six Wisdom tools are available to the AI Config Agent:

### search_account
Find accounts by name (fuzzy match). Returns Salesforce IDs, ARR, lifecycle stage, ICP rank, and industry.

### get_recent_calls
Recent Gong calls for an account within a time window. Returns call titles, dates, participants, and linked opportunity names. Useful for understanding recent engagement.

### get_call_details
Full content for a specific Gong call by `origin_record_id`. Returns the transcript, participants, and all opportunity metadata.

### get_support_tickets
Recent Zendesk tickets for an account. Returns status, type, channel, satisfaction rating, and content. Useful for identifying support health signals.

### get_account_feedback
Aggregated feedback insights across all sources. Returns a theme breakdown (complaints, praise, improvement requests) and source distribution. This is the "health check" tool.

### get_slack_mentions
Recent internal Slack messages referencing an account. Searches across all channels for content mentions. Returns channel, author, content, and date. Default lookback is 90 days (Slack volume is low: ~2,000 total messages).

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
- Platform-aware LIMIT values (Gong: 2 for transcripts, Zendesk: 10, etc.)
- `type != 'MISC'` filter on taxonomy nodes (L1/L2/L3/Theme/Subtheme)

Key graph traversal pattern:
```
(nli:NaturalLanguageInteraction)-[:PROVIDED_BY_ACCOUNT]->(a:Account)
```

This links any interaction (Gong call, Zendesk ticket, Slack message) to its associated account, enabling account-centric queries across all sources.

## Future Enhancements

- **Feedback taxonomy analysis**: Use L1/L2/L3 taxonomy for product-area-specific analysis
- **Sentiment analysis**: Available for single-user sources (Zendesk, reviews) via SentimentPrediction nodes
- **Trend analysis**: Time-series queries using `toStartOfMonth()` for identifying patterns
- **Custom Cypher**: Allow the AI Config Agent to construct ad-hoc Cypher queries for novel questions
