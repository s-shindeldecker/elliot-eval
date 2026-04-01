# elliot-eval

**Elliot** — Experimentation Line-of-sight & Impact Observation Tracker

## Purpose

Elliot is an AI teammate that detects, validates, and communicates how experimentation influences revenue motion, expansion, competitive positioning, and AI adoption at LaunchDarkly — especially as direct ARR attribution becomes structurally invisible.

This repository contains the **operational agent pipeline** and **evaluation harness** used to build, test, and continuously improve Elliot.

---

## Architecture

Elliot runs as a three-stage pipeline orchestrated by TypeScript code (`ElliotAgent`):

```
User Query → Scout (LLM Agent via LD AI Config + Wisdom Tools)
           → Curator (Deterministic Code)
           → Judge (LLM Scorer via LD AI Config)
           → Response + Scored EIC
```

**Scout** is an LLM agent managed by the `elliot-agent` LD AI Config (model: `gpt-4o`). It uses tools to gather intelligence from the Enterpret Knowledge Graph (Gong calls, Zendesk tickets, Slack mentions, feedback themes, account data). It handles multi-turn conversations with disambiguation when multiple accounts match a query.

**Curator** is deterministic TypeScript code (`curateToolResults()`) that transforms the Scout's raw tool results into a structured `SignalBundle`. It infers opportunity metadata from Gong's Salesforce-linked fields, computes feedback trajectory (recency-weighted complaint/praise analysis), and renders a deterministic text packet for the Judge. No LLM involved — same inputs always produce the same output.

**Judge** is a separate, tool-less LLM managed by the `elliot-candidate-a` LD AI Config (variation: `first-new-candidate`, model: `gpt-4o-mini`). It receives the Curator's rendered packet as `input_text` and returns structured JSON: action (CREATE/UPDATE/NO_ACTION), full EIC object, and human summary.

The orchestration between stages happens entirely in code (`src/agent/elliot-agent.ts`), not inside any LLM. Each stage is isolated — they don't share a conversation or context window.

| Component | Role | Status |
|-----------|------|--------|
| **Scout** | LLM agent with 6 Wisdom tools; gathers account intelligence with multi-turn disambiguation | Implemented |
| **Curator** | Deterministic transform: tool results → SignalBundle → rendered packet; includes feedback trajectory computation | Implemented |
| **Judge** | LLM scorer: curated packet → structured JSON assessment (EIC) | Implemented |
| **Wisdom Tools** | Cypher queries against Enterpret KG (Gong, Zendesk, Slack, feedback themes) | Implemented |
| **Salesforce Tools** | Direct Salesforce API for opportunity/account data | Stubbed (pending credentials) |
| **CLI Harness** | Interactive multi-turn testing with conversation history | Implemented |
| **Slack Bot** | Slack Bolt transport layer (Socket Mode) | Implemented (not primary interface) |
| **Eval Harness** | Gold test dataset, adversarial packets, regression testing | Implemented (10/10 gold passing) |
| **Scribe** | Persist decisions + lifecycle management | Planned |

---

## Architecture Docs

- [Elliot documentation index](docs/architecture/elliot/README.md)
- [Pipeline overview](docs/architecture/elliot/pipeline.md)
- [Wisdom integration](docs/architecture/elliot/wisdom-integration.md)
- [Decision Contract (v2)](docs/architecture/elliot/decision-contract.md)
- [Enums](docs/architecture/elliot/enums.md)
- [Credibility Standards](docs/architecture/elliot/credibility-standards.md)
- [ADR-0001: Scribe separation](docs/decisions/ADR-0001-scribe-separation.md)

---

## Quick Start

```bash
npm install

# Interactive CLI (full pipeline: Scout → Curator → Judge)
npm run agent:cli

# Run gold evaluation suite
npm run eval:ld:gold

# Replay saved Curator packets through the Judge
npm run judge:test
```

---

## Key Files

| File | Role |
|------|------|
| `src/agent/elliot-agent.ts` | Orchestrates Scout → Curator → Judge pipeline |
| `src/curator/curate-tool-results.ts` | Deterministic tool results → SignalBundle transform |
| `src/curator/render-packet.ts` | SignalBundle → deterministic input_text for Judge |
| `src/curator/validate-bundle.ts` | SignalBundle structural validation |
| `src/tools/wisdom/tools.ts` | Wisdom tool implementations (Cypher queries) |
| `src/tools/wisdom/types.ts` | Tool parameter/result types and JSON schemas |
| `src/adapter/ld-client.ts` | LD AI Config client (tool-use + simple invoke) |
| `scripts/agent-cli.ts` | CLI harness with multi-turn conversation support |
| `scripts/judge-test.ts` | Judge replay harness for A/B testing |
| `docs/prompts/elliot-scout.md` | Scout system prompt (synced to LD AI Config) |
| `docs/prompts/elliot-judge.md` | Judge system prompt (synced to LD AI Config) |

---

## Agent Output Contract

The Judge returns:

```json
{
  "human_summary": ["string (2-5 bullets)"],
  "json": {
    "action": "CREATE | UPDATE | NO_ACTION",
    "eic": { ... } | null
  }
}
```

- `action` determines whether to create, update, or skip an Experimentation Impact Case (EIC)
- `eic` is required for CREATE/UPDATE, must be null for NO_ACTION
- All outputs pass AJV schema validation (`src/schemas/agent-response.ts`)

---

## LD AI Configs

| Config Key | Variation | Model | Role |
|------------|-----------|-------|------|
| `elliot-agent` | `baseline` | `gpt-4o` | Scout — gathers intelligence via tools |
| `elliot-candidate-a` | `first-new-candidate` | `gpt-4o-mini` | Judge — scores curated packets |
| `elliot-candidate-a` | `baseline` | `gpt-4o-mini` | Judge (legacy variation) |

Prompts are maintained in `docs/prompts/` and can be synced to LD AI Configs programmatically via the LaunchDarkly MCP (`update-ai-config-variation`).

---

## Curator Features

The Curator deterministically processes Scout tool results into a structured packet:

- **OpportunitySnapshot inference**: Opportunity name, stage, amount, AE owner from Gong Salesforce-linked fields
- **Enriched account data**: Account type, ARR, industry, owner, lifecycle stage from `search_account` results
- **Boolean flag inference**: experimentation_team_engaged, ai_configs_adjacent, competitive_mention from call titles and feedback themes
- **Feedback trajectory**: Recency-weighted analysis splitting feedback into early/recent windows to detect improving, declining, or stable trends
- **Evidence items**: Source type, source ID, timestamp, and snippet for each Gong call, Zendesk ticket, and Slack message (with channel/author context)

---

## Dataset Schema

Each JSONL row:

```json
{
  "id": "string",
  "input_text": "string",
  "expected": {
    "action": "CREATE | UPDATE | NO_ACTION",
    "create_eic": true | false,
    "eic": { ... }
  },
  "tags": ["gold"]
}
```

Expected EIC fields support both exact match and set checks:
- Exact: `"primary_influence_tag": "competitive_displacement"`
- Set: `"primary_influence_tag_allowed": ["expansion_catalyst", "strategic_positioning"]`
- Range: `"influence_strength_range": [3, 5]`
- Allowed: `"confidence_allowed": ["Medium", "High"]`

---

## Failure Codes

| Code | Meaning |
|------|--------|
| JSON_PARSE_ERROR | No valid JSON |
| SCHEMA_INVALID | AJV schema failure |
| DECISION_MISMATCH | Wrong action |
| FIELD_MISMATCH | Enum / field mismatch |
| RANGE_VIOLATION | Numeric bounds violation |
| HALLUCINATED_CITATION | Evidence URL not in input |
| MISSING_REQUIRED_FIELD | eic missing when required |
| ADAPTER_ERROR | Adapter failure |
| TIMEOUT | Invocation timeout |
| CONFIG_ERROR | Dataset malformed |

---

## Datasets

| File | Purpose |
|------|--------|
| `data/elliot.gold.v0.1.jsonl` | Gold evaluation (10 cases) |
| `data/gold.sample.jsonl` | Screening |
| `data/elliot.gold.holdout.v0.1.jsonl` | Holdout |
| `data/scout-v0.samples.json` | Scout v0 input fixtures |
| `data/scout-v0.dataset.jsonl` | Scout → Judge dataset |

---

## npm Scripts

### Primary

```bash
npm run agent:cli                # Interactive Scout → Curator → Judge pipeline
npm run eval:ld:gold             # Run gold evaluation suite (10 cases)
npm run judge:test               # Replay saved Curator packets through Judge
```

### Evaluation

```bash
npm run eval:ld:screening        # Screening eval via LD AI Config
npm run eval:ld:holdout          # Holdout eval
npm run eval:gold                # Gold with mock adapters
npm run report:candidate         # Generate candidate evaluation report
```

### Testing

```bash
npm run test:screening           # Screening with mock agents
npm run test:contract-v2         # Contract validation tests
npm run test:curator             # Curator smoke test
npm run test:curator-judge-e2e   # Curator → Judge end-to-end
npm run test:scout:v0            # Scout v0 fixture tests
```

### Slack Bot

```bash
npm run start:slack
```

---

## Environment Variables

Required:

```bash
export LD_SDK_KEY=...
export OPENAI_API_KEY=...
```

For the CLI agent:

```bash
export WISDOM_SERVER_URL=...          # Enterpret KG MCP endpoint
export WISDOM_AUTH_TOKEN=...          # Bearer token for Wisdom
export ELLIOT_AI_CONFIG_KEY=elliot-agent  # optional, defaults to "elliot-agent"
```

For Slack bot (Socket Mode):

```bash
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_APP_TOKEN=xapp-...
```

---

## Data Sources (via Wisdom / Enterpret KG)

| Source | Records | Signals |
|--------|---------|---------|
| **Gong** | ~12,500 | Call transcripts, participants, Salesforce opportunity linkage (name, stage, amount) |
| **Zendesk** | ~15,500 | Tickets, status |
| **Slack** | ~2,000 | Internal messages across 21 indexed channels (with channel name and author) |
| **Feedback themes** | Aggregated | NLP-derived themes with timeline data across all sources |
| **Jira** | ~120 | Feature requests, engineering tickets |
| **G2** | ~67 | Public product reviews |

Account nodes carry Salesforce metadata (ID, name, type, ARR, industry, owner, lifecycle stage). The Curator enriches packets with this data when available.

---

## Current Eval Status

**Gold eval (10 cases): 10/10 passing (100%)**

- All action decisions correct
- Influence tag expectations use set-based matching for ambiguous cases
- Zero hard failures (no hallucinations, schema errors, or parse failures)
- Average latency: ~6s per case

---

## Summary

This repo contains the **operational agent pipeline** and **evaluation harness** for Elliot:

- **Agent pipeline** — Scout (LLM) → Curator (deterministic) → Judge (LLM), with multi-turn CLI and Slack interfaces
- **Eval harness** — Gold test cases, adversarial packets, regression suites, hallucination detection
- **LD AI Config integration** — Prompts managed via LaunchDarkly AI Configs, syncable via MCP
- **Wisdom integration** — 6 tools querying the Enterpret Knowledge Graph via Cypher

Elliot becomes a dependable agent teammate through structured evaluation, evidence-grounded reasoning, and continuous calibration.
