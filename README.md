# elliot-eval

**Elliot Evaluation Harness** — Experimentation Line-of-sight & Impact Observation Tracker

## Purpose

Elliot’s mission is to maintain a continuously updated, evidence-grounded intelligence system that detects, validates, and communicates how experimentation influences revenue motion, expansion, competitive positioning, and AI adoption at LaunchDarkly — especially in environments where ARR attribution is no longer directly observable.

The role exists to convert fragmented signals into defensible, structured impact intelligence.

This repository contains the **evaluation harness and module scaffolding** used to build, test, and “hire” Elliot as an agentic teammate.

---

## Pipeline Overview

Elliot operates as a four-stage pipeline:

Scout → Curator → Judge → Scribe

| Stage | Role | Status |
|------|------|--------|
| **Scout** | Gathers raw evidence from sources (Salesforce, Gong, CRM) → produces `SignalBundle` | v0 implemented, Salesforce-shaped v1 scaffold |
| **Curator** | Validates and normalizes bundles → renders deterministic packet | Implemented (render + validation; scoring partial) |
| **Judge** | Classifies impact → outputs structured JSON (Decision Contract) | Implemented via LD AI Config evaluation |
| **Scribe** | Persists decisions + lifecycle management | In-memory prototype only |

Validation, normalization, scoring, and reporting are **deterministic and auditable**.

Model responses (LD/OpenAI) are **not deterministic**, but are evaluated under deterministic rules.

---

## Architecture Docs

- [Elliot documentation index](docs/architecture/elliot/README.md)
- [Pipeline overview](docs/architecture/elliot/pipeline.md)
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

Run:

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

## Summary

This repo is not the Elliot system itself.

It is the **hiring and evaluation framework** used to:

- test candidate agents
- enforce strict contracts
- prevent hallucination
- validate evidence-grounded reasoning
- support reproducible decision-making

Elliot becomes a dependable agent teammate through this process.
