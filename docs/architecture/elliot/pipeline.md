# Elliot Pipeline Architecture

## Overview

Elliot has two execution modes that share the same Curator and Judge contracts.

### Mode 1: Interactive Agent (Slack / CLI)

The interactive pipeline runs three stages end-to-end:

```
User Query → Scout (elliot-agent AI Config + tools)
           → Curator (deterministic code)
           → Judge (elliot-judge AI Config)
           → Response + Scoring
```

**Scout** is an LLM agent managed by the `elliot-agent` LD AI Config. It decides which tools to call (Wisdom, Salesforce) and synthesizes a natural-language response for the user.

**Curator** is deterministic code (`curateToolResults()`) that takes the raw tool call results from Scout and normalizes them into a `SignalBundle`. Same inputs always produce the same bundle. No LLM involved.

**Judge** is a separate LLM managed by the `elliot-judge` LD AI Config. It receives the curated `input_text` packet and returns a structured JSON scoring (action, confidence, human summary). Judge has no tools and no side effects.

Key files:
- `src/agent/elliot-agent.ts` — Orchestrates Scout → Curator → Judge
- `src/curator/curate-tool-results.ts` — Deterministic tool results → SignalBundle transform
- `src/curator/validate-bundle.ts` — SignalBundle validation
- `src/curator/render-packet.ts` — SignalBundle → deterministic input_text
- `src/tools/wisdom/` — Enterpret Knowledge Graph tools
- `src/tools/salesforce/` — Salesforce API tools (stubbed)
- `src/adapter/ld-client.ts` — LD AI Config client (tool-use + simple invoke)
- `src/slack/` — Slack Bot transport layer
- `scripts/agent-cli.ts` — CLI harness for testing

### Mode 2: Eval Pipeline (Offline)

The eval harness tests Judge in isolation with static input packets:

- **Scout** — Gathers raw evidence from data sources, enriches it with opportunity metadata, and proposes field values. Scout does NOT make the create/no-create decision or emit EIC JSON.
- **Curator** — Normalizes Scout output into a `SignalBundle`, validates it, and renders a deterministic `input_text` packet that Judge can consume. The internal `SignalBundle` type lives in `src/types/signal-bundle.ts`; the renderer is `src/curator/render-packet.ts`.
- **Judge** — Receives an `input_text` packet and returns a strict JSON decision (`human_summary` + `json.action` / `json.eic`). Judge is stateless, deterministic, and produces no side effects beyond its JSON output.
- **Scribe** *(future)* — Consumes Judge's JSON output plus pipeline metadata and writes to persistence targets (spreadsheets, databases, dashboards). Scribe owns all write/export operations.

### Relationship Between Modes

Both modes share the same Curator code (`validateBundle`, `renderPacket`) and Judge contract. The interactive agent adds `curateToolResults()` to bridge live tool results into the SignalBundle format. The eval harness can test Judge independently using static input packets and known expected outputs.

## Contracts

### Curator → Judge

Curator produces an `input_text` string in a fixed packet format:

```
<Title>

OPPORTUNITY SNAPSHOT
- EIC ID (if updating): ...
- Account: ...
...
EVIDENCE
1) Source Type: ...
  Source Link: ...
  Snippet: "..."

NOTES
- ...
```

Internally this is rendered from a `SignalBundle` struct, but Judge only sees the flat text.

### Judge → downstream

Judge returns JSON conforming to the agent output contract:

```json
{
  "human_summary": ["..."],
  "json": {
    "create_eic": true,
    "eic": { /* 22-field EIC object */ }
  }
}
```

The exact schema is defined in `src/schemas/agent-response.ts` (AJV, `additionalProperties: false`).

### Scribe (future)

Scribe will consume:
- Judge's JSON output (the agent response)
- Pipeline metadata (case ID, timestamps, scores, failure details)

Scribe will write to:
- Google Sheets / spreadsheets
- `results.jsonl` / `summary.csv` (may absorb current reporter role)
- Dashboards or notification channels

Scribe does not exist yet. Until it does, the eval harness reporter (`src/reporter.ts`) handles output artifacts for testing purposes only.

## Non-goals and guardrails

1. **Judge MUST NOT perform persistence.** No spreadsheet writes, no database inserts, no file I/O, no tool calls beyond decision generation. Judge returns JSON and nothing else.
2. **Judge MUST NOT call external tools** (APIs, MCP servers, file systems) as part of its decision. All evidence must be present in the input packet.
3. **Scout MUST NOT decide `create_eic`** or emit structured EIC JSON. Scout gathers evidence and proposes field values; the decision is Judge's responsibility.
4. **Curator MUST NOT score or validate Judge output.** Curator operates upstream of Judge; scoring is the eval harness's job.

## Why this separation

- **Testability** — Judge can be evaluated in isolation with static input packets and deterministic expected outputs, without needing live data sources or write targets.
- **Model swapability** — Swapping the model behind Judge (via LaunchDarkly AI Config or other adapters) does not require changes to persistence or data gathering.
- **Stability** — Changes to export format (spreadsheet columns, dashboard schema) do not affect Judge's contract or eval harness results.
- **Tool isolation** — Only Scribe needs write credentials and API access to output targets. Judge and Curator operate with zero external write permissions.
- **Auditability** — Every stage boundary is a serializable artifact (SignalBundle → input_text → JSON decision → persisted record), enabling replay and debugging at any seam.
