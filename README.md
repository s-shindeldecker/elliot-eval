# elliot-eval

**Elliot Evaluation Harness** — Experimentation Line-of-sight & Impact Observation Tracker

## Purpose

Elliot’s mission is to maintain a continuously updated, evidence-grounded intelligence system that detects, validates, and communicates how experimentation influences revenue motion, expansion, competitive positioning, and AI adoption at LaunchDarkly — especially in environments where ARR attribution is no longer directly observable.

The role exists to convert fragmented signals into defensible, structured impact intelligence.

This repository contains the **evaluation harness and module scaffolding** used to build, test, and “hire” Elliot as an agentic teammate.

---

## Architecture

Elliot has evolved from a four-stage pipeline to an **AI Config Agent** pattern:

### Current: AI Config Agent (v2)

A single LD AI Config Agent receives user queries (via Slack or CLI), uses tools to gather intelligence, and produces a natural-language response with optional scoring.

```
Slack Message → Slack Bot → LD AI Config Agent → Response → Slack Reply
                                  │
                                  ├── Wisdom Tools (Enterpret KG: Gong, Zendesk, Slack, Jira, G2)
                                  ├── Salesforce Tools (API — pending credentials)
                                  └── Pipeline Tools (Curator → Judge)
```

The LLM decides which tools to call, in what order, and how to interpret results. Scout orchestration logic lives in the AI Config prompt, not in code.

| Component | Role | Status |
|-----------|------|--------|
| **Wisdom Tools** | Queries Enterpret Knowledge Graph for Gong calls, support tickets, Slack mentions, Jira tickets, G2 reviews | Implemented |
| **Salesforce Tools** | Queries Salesforce API for opportunity, account, activity, contact data | Stubbed (pending API credentials) |
| **AI Config Agent** | LLM-driven orchestrator using LD AI Config for prompt/model management | Implemented |
| **Slack Bot** | Thin transport layer using Slack Bolt (Socket Mode) | Implemented |
| **Curator** | Validates and normalizes bundles → renders deterministic packet | Implemented |
| **Judge** | Classifies impact → outputs structured JSON (Decision Contract) | Implemented via LD AI Config evaluation |
| **Scribe** | Persists decisions + lifecycle management | In-memory prototype only |

### Legacy: Pipeline Mode (v1)

The original four-stage pipeline (Scout → Curator → Judge → Scribe) remains for **offline evaluation** with fixture data. The deterministic mapper path (`mapSalesforceRecordToBundle`) and eval harness are unchanged.

Validation, normalization, scoring, and reporting are **deterministic and auditable**.

Model responses (LD/OpenAI) are **not deterministic**, but are evaluated under deterministic rules.

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

npm run test:screening
npm run test:contract-v2
npm run eval:sample
```

---

## Agent Output Contract (v2)

Agents must return:

```json
{
  "human_summary": ["string"],
  "rationale": {
    "because": [{ "claim": "string", "evidence_refs": ["ev-1"] }],
    "assumptions": ["string"],
    "open_questions": ["string"]
  },
  "json": {
    "action": "CREATE" | "UPDATE" | "NO_ACTION",
    "eic": { ... } | null
  }
}
```

### Rules

- `action` replaces legacy `create_eic`
- `eic` required for CREATE/UPDATE
- `eic` must be null for NO_ACTION
- All outputs must pass AJV schema validation

### Source of truth

`src/schemas/agent-response.ts`

---

## Dataset Schema

Each JSONL row:

```json
{
  "id": "string",
  "input_text": "string",
  "expected": {
    "action": "CREATE" | "UPDATE" | "NO_ACTION",
    "create_eic": true | false,
    "eic": { ... }
  },
  "tags": ["screening"]
}
```

Only fields present in `expected.eic` are scored.

---

## Failure Codes

| Code | Meaning |
|------|--------|
| JSON_PARSE_ERROR | No valid JSON |
| SCHEMA_INVALID | AJV schema failure |
| DECISION_MISMATCH | Wrong action |
| FIELD_MISMATCH | Enum / field mismatch |
| RANGE_VIOLATION | Numeric bounds violation |
| HALLUCINATED_CITATION | Evidence not in input |
| MISSING_REQUIRED_FIELD | eic missing when required |
| ADAPTER_ERROR | Adapter failure |
| TIMEOUT | Invocation timeout |
| CONFIG_ERROR | Dataset malformed |

---

## Pass / Fail Rules

### Screening
- Must pass **100% of cases**

### Gold
Must satisfy:
- passRate ≥ threshold (85%)
- zero hard failures

Hard failures:
- hallucination
- schema failure
- parse error
- adapter failure
- timeout

---

## Datasets

| File | Purpose |
|------|--------|
| `data/gold.sample.jsonl` | Screening |
| `data/elliot.gold.v0.1.jsonl` | Gold |
| `data/elliot.gold.holdout.v0.1.jsonl` | Holdout |
| `data/scout-v0.samples.json` | Scout input |
| `data/scout-v0.dataset.jsonl` | Scout → Judge |

---

## Fixtures

| Directory | Purpose |
|----------|--------|
| `fixtures/mock-responses` | Mock agent outputs |
| `fixtures/curator-packets/gold` | Gold packets |
| `fixtures/curator-packets/adversarial` | Stress cases |

---

## npm Scripts

### Screening
```bash
npm run test:screening
npm run test:screening:perfect
npm run test:screening:hallucinator
npm run test:screening:bad-json
npm run test:screening:all
```

> `test:screening:all` intentionally fails because it includes failing mocks

### Gold
```bash
npm run test:gold:perfect
npm run test:gold:hallucinator
npm run test:gold:bad-json
npm run eval:gold
```

### LD Integration
```bash
npm run eval:ld:screening
npm run eval:ld:gold
npm run eval:ld:holdout
```

### Slack Bot
```bash
npm run start:slack
```

Requires: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `LD_SDK_KEY`, `OPENAI_API_KEY`

Optional: `WISDOM_SERVER_URL`, `WISDOM_AUTH_TOKEN`, `ELLIOT_AI_CONFIG_KEY`

### Curator / Scout
```bash
npm run test:curator
npm run test:curator-judge-e2e
npm run test:scout:v0
npm run build:scout:v0:dataset
npm run eval:ld:scout:v0
```

### Contract Tests
```bash
npm run test:contract-v2
```

### Reporting
```bash
npm run report:candidate
```

---

## LaunchDarkly Integration

Required:

```bash
export LD_SDK_KEY=...
export LD_AI_CONFIG_KEY=...
export OPENAI_API_KEY=...
```

For the Slack bot (Socket Mode):

```bash
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_APP_TOKEN=xapp-...
export WISDOM_SERVER_URL=...          # Enterpret KG MCP endpoint
export WISDOM_AUTH_TOKEN=...          # Bearer token for Wisdom
export ELLIOT_AI_CONFIG_KEY=elliot-agent  # optional, defaults to "elliot-agent"
```

Run eval:

```bash
npm run eval:ld:screening
npm run eval:ld:gold
```

---

## Candidate Evaluation Report

```bash
npm run report:candidate -- --run out/<dir> --candidate <name>
```

Outputs:

`out/candidate-eval.json`

---

## Scout → Curator → Judge Loop

### Scout v0

```bash
npm run test:scout:v0
npm run build:scout:v0:dataset
npm run eval:ld:scout:v0
```

### Salesforce Scout (v1 scaffold)

```bash
npm run test:scout:salesforce
```

---

## Adding Agents

```json
{
  "name": "agent",
  "adapter": "mock",
  "config": { "responsesPath": "./file.jsonl" }
}
```

---

## Adding Datasets

1. Create JSONL file
2. Add tags if needed
3. Run with `--dataset`

---

## Regression Tests

```bash
npm run test:screening
npm run test:contract-v2
npm run test:curator-judge-e2e
```

---

## Data Sources (via Wisdom / Enterpret KG)

The Wisdom MCP provides unified access to:

| Source | Records | Signals |
|--------|---------|---------|
| **Gong** | ~12,500 | Call transcripts, participants, opportunity linkage, MEDDPICC fields |
| **Zendesk** | ~15,500 | Tickets, priority, satisfaction, product categories |
| **Slack** | ~2,000 | Internal messages, channel context |
| **Jira** | ~120 | Feature requests, engineering tickets |
| **G2** | ~67 | Public product reviews |

Salesforce data appears as metadata on Gong records (opportunity name, stage, amount) and as Account nodes with `salesforce_id` — enabling cross-source correlation.

---

## Summary

This repo contains both the **evaluation harness** for testing Elliot's decision-making and the **operational agent** that gathers intelligence and produces assessments.

- **Eval harness** — test candidate models, enforce contracts, prevent hallucination, validate evidence-grounded reasoning
- **AI Config Agent** — production agent using Wisdom + Salesforce tools, deployed via Slack
- **Pipeline stages** — Curator, Judge, Scribe remain modular and independently testable

Elliot becomes a dependable agent teammate through this process.
