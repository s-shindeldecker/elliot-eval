# elliot-eval

**Elliot Evaluation Harness** — Experimentation Line-of-sight & Impact Observation Tracker

Elliot is an agentic system that maintains a continuously updated, evidence-grounded intelligence system. It detects, validates, and communicates how experimentation influences revenue motion, expansion, competitive positioning, and AI adoption at LaunchDarkly — especially in environments where ARR attribution is no longer directly observable.

The role exists to convert fragmented signals into defensible, structured impact intelligence.

This repository contains the evaluation harness: a CLI tool that runs datasets through agent candidates, validates strict JSON output against the Elliot Decision Contract (v2), scores via deterministic rule-based checks, and produces `results.jsonl` + `summary.csv` + console summary.

## Pipeline overview

Elliot operates as a four-stage pipeline with strict contracts at each boundary:

| Stage | Role | Status |
|-------|------|--------|
| **Scout** | Gathers raw evidence from sources (Salesforce, Gong, CRM) and produces a `SignalBundle` | v0 + Salesforce v1 skeleton |
| **Curator** | Validates and normalizes the `SignalBundle`, renders it into a deterministic input packet | Implemented |
| **Judge** | Classifies impact, produces structured JSON output conforming to the Decision Contract | Implemented (LD AI Config) |
| **Scribe** | Persists decisions and manages EIC lifecycle (CREATE/UPDATE semantics) | In-memory store only |

Every claim is evidence-backed, traceable, and conservatively constructed. Output is deterministic and auditable.

## Architecture docs

- [Elliot documentation index](docs/architecture/elliot/README.md) — full documentation set
- [Pipeline overview](docs/architecture/elliot/pipeline.md) — Scout → Curator → Judge → Scribe responsibilities and contracts
- [Decision Contract (v2)](docs/architecture/elliot/decision-contract.md) — strict JSON output schema, evidence array, rationale shape, and warning codes
- [Shared Enumerations](docs/architecture/elliot/enums.md) — single source of truth for all enum values
- [Credibility Standards](docs/architecture/elliot/credibility-standards.md) — evidence tiers and classification rules
- [ADR-0001: Scribe separation](docs/decisions/ADR-0001-scribe-separation.md) — why Judge returns JSON only

## Quick start

```bash
npm install
npm run test:screening          # CI regression gate (mock-perfect, exit 0)
npm run test:contract-v2        # 116 unit tests for Decision Contract v2
npm run eval:sample             # same dataset, no --failFast
```

## Agent output contract (v2)

Every agent must return a response containing JSON that matches:

```jsonc
{
  "human_summary": ["string"],  // 1–8 non-empty bullets, each ≤200 chars
  "rationale": {                // optional — structured evidence-referenced reasoning
    "because": [{ "claim": "string", "evidence_refs": ["ev-1"] }],
    "assumptions": ["string"],
    "open_questions": ["string"]
  },
  "json": {
    "action": "CREATE" | "UPDATE" | "NO_ACTION",
    "eic": { /* full EIC object */ } | null
  }
}
```

When `action` is `CREATE` or `UPDATE`, `eic` must be a full object with all required fields.
When `action` is `NO_ACTION`, `eic` must be `null`.

Key EIC fields include: `eic_id`, `account`, `opportunity`, `stage`, `stage_bucket`, `motion`, `impact_classification`, `confidence`, `influence_strength` (1–5 integer or null), `impact_priority` (1–5 integer), `evidence` (array of `EvidenceRef` objects), `status`, and more.

**Backward compatibility:** Legacy payloads using `create_eic: boolean` are normalized automatically — `true` maps to `CREATE`, `false` to `NO_ACTION`. Legacy `evidence_citation_1`/`evidence_citation_2` fields are migrated to `evidence[]`. Legacy `status: "CW"`/`"CL"` is mapped to `status: "Active"` + appropriate `commercial_outcome`.

See `src/schemas/agent-response.ts` for the exact AJV schema and [Decision Contract (v2)](docs/architecture/elliot/decision-contract.md) for full documentation.

## Dataset schema

Each line in the JSONL dataset must conform to:

```jsonc
{
  "id": "string",               // unique case identifier
  "input_text": "string",       // full text fed to the agent
  "expected": {
    // primary decision — provide one of:
    "action": "CREATE" | "UPDATE" | "NO_ACTION",  // v2 preferred
    "create_eic": true | false,                    // v1 alternative (auto-mapped)
    "eic": {                     // optional — only when action is CREATE/UPDATE
      // exact-match fields (FIELD_MISMATCH if wrong)
      "status": "Active" | "Monitoring" | "Under Review",
      "primary_influence_tag": "string",
      "secondary_tag": "string | null",
      "impact_classification": "CONFIRMED" | "PROBABLE" | "HYPOTHESIZED" | "NO_IMPACT",
      "ai_configs_adjacent": "Yes" | "No" | "Unknown",
      "competitive_mention": "Yes" | "No" | "Unknown",
      "exec_sponsor_mentioned": "Yes" | "No" | "Unknown",
      "experimentation_team_engaged": "Yes" | "No" | "Unknown",
      "stage_bucket": "Early" | "Mid" | "Late" | "Closed",
      "motion": "Net-new" | "Expansion" | "Renewal" | "Other",

      // range/set checks (RANGE_VIOLATION if outside)
      "influence_strength_range": [min, max],   // integers within 1..5
      "impact_priority_range": [min, max],       // integers within 1..5
      "confidence_allowed": ["Low", "Medium", "High"]
    }
  },
  "tags": ["screening"]         // optional — used for stage filtering
}
```

Only fields present in `expected.eic` are scored. Omitted fields are not checked.

## Failure codes

| Code | Trigger |
|------|---------|
| `JSON_PARSE_ERROR` | No parseable JSON found in agent response |
| `SCHEMA_INVALID` | JSON parsed but fails AJV schema validation |
| `DECISION_MISMATCH` | `action` does not match expected |
| `FIELD_MISMATCH` | Exact-match field mismatch (status, tags, enums, classification) |
| `RANGE_VIOLATION` | `influence_strength`, `impact_priority` outside range, or `confidence` not in allowed set |
| `HALLUCINATED_CITATION` | URL in `eic.evidence[]` not found verbatim in `input_text` |
| `MISSING_REQUIRED_FIELD` | `action=CREATE/UPDATE` but agent returned `eic: null` |
| `ADAPTER_ERROR` | Adapter returned an error (e.g. LD stub missing env vars) |
| `TIMEOUT` | Adapter invocation exceeded `--timeoutMs` |
| `CONFIG_ERROR` | Dataset row has malformed expected object |

## Normalization warnings

The normalizer (`src/normalize.ts`) emits advisory warnings when transforming legacy payloads. These do not fail validation.

| Warning code | Meaning |
|---|---|
| `LEGACY_INFLUENCE_ZERO` | `influence_strength=0` coerced to `null` |
| `IMPACT_CLASSIFICATION_DEFAULTED` | Missing `impact_classification` defaulted to `HYPOTHESIZED` |
| `ACTION_INFERRED_UPDATE` | `action=UPDATE` inferred from `create_eic=true` + existing `eic_id` |
| `LEGACY_STATUS_CW_CL_MAPPED` | `status="CW"/"CL"` mapped to `status="Active"` + `commercial_outcome` |
| `classification_confidence_mismatch` | Confidence/classification coupling rule violated (Model B) |
| `human_summary_grounding` | No rationale evidence refs found in summary |
| `dangling_evidence_ref` | Evidence ref in rationale does not match any `evidence_id` |
| `duplicate_human_summary` | Duplicate bullet detected in `human_summary` |

## Pass/fail rules

**Screening stage:** An agent passes only if every case passes (zero failures of any kind). `--failFast` aborts on the first failure.

**Gold stage:** An agent passes only if **both** conditions are met:

1. `passRate >= threshold` (default 85%)
2. `hard_fail_count == 0` — zero results containing any of the **hard-gate failure codes**:
   `HALLUCINATED_CITATION`, `SCHEMA_INVALID`, `JSON_PARSE_ERROR`, `ADAPTER_ERROR`, `CONFIG_ERROR`, `TIMEOUT`

Soft failures (`DECISION_MISMATCH`, `FIELD_MISMATCH`, `RANGE_VIOLATION`, `MISSING_REQUIRED_FIELD`) reduce pass rate but do not trigger the hard gate.

## Datasets

| File | Cases | Purpose |
|------|-------|---------|
| `data/gold.sample.jsonl` | 3 | Screening dataset |
| `data/elliot.gold.v0.1.jsonl` | 10 | Gold evaluation dataset |
| `data/elliot.gold.holdout.v0.1.jsonl` | 3 | Holdout evaluation dataset |
| `data/curator.synthetic.v0.1.jsonl` | 6 | Synthetic SignalBundles for curator |
| `data/curator.synthetic.dataset.v0.1.jsonl` | 6 | Generated dataset from synthetic bundles |
| `data/scout-v0.samples.json` | 3 | Salesforce-shaped Scout v0 inputs |
| `data/scout-v0.dataset.jsonl` | 3 | Generated dataset from Scout v0 samples |
| `data/salesforce-opportunity.sample.json` | 1 | Salesforce Scout v1 fixture record |

Additional evaluation fixtures:

| Directory | Count | Purpose |
|-----------|-------|---------|
| `fixtures/curator-packets/gold/` | 8 | Gold-standard Curator → Judge test packets |
| `fixtures/curator-packets/adversarial/` | 7 | Adversarial packets testing Judge robustness |

## Fixture configs

Use the **stable fixture configs** for local testing and CI. Each targets a specific mock agent:

**Screening-stage configs** (dataset: `data/gold.sample.jsonl`):

| Config file | Agent(s) | Expected exit |
|-------------|----------|---------------|
| `fixtures/eval-config.perfect.json` | mock-perfect | 0 (all pass) |
| `fixtures/eval-config.hallucinator.json` | mock-hallucinator | 1 (HALLUCINATED_CITATION) |
| `fixtures/eval-config.bad-json.json` | mock-bad-json | 1 (JSON_PARSE_ERROR / SCHEMA_INVALID) |
| `fixtures/eval-config.all-mocks.json` | all three | 1 (mixed failures) |

**Gold-stage configs** (dataset: `data/elliot.gold.v0.1.jsonl`):

| Config file | Agent(s) | Expected exit |
|-------------|----------|---------------|
| `fixtures/eval-config.gold.json` | all three gold mocks | 1 (mixed) |
| `fixtures/eval-config.holdout.json` | LD agent (holdout dataset) | varies |

**LaunchDarkly agent configs:**

| Config file | Dataset | Stage |
|-------------|---------|-------|
| `fixtures/eval-config.ld.json` | `data/gold.sample.jsonl` | screening |
| `fixtures/eval-config.curator-synth.ld.json` | `data/curator.synthetic.dataset.v0.1.jsonl` | gold |
| `fixtures/eval-config.scout-v0.ld.json` | `data/scout-v0.dataset.jsonl` | gold |

Scripts use `--agents` to filter from multi-agent configs.

> **Note:** `fixtures/eval-config.json` is a legacy convenience file and may be overwritten during development. Do not rely on it for scripted tests. Use the named configs above instead.

## npm scripts

```bash
# ── Screening ──
npm run test:screening              # CI gate: mock-perfect, --failFast → exit 0
npm run test:screening:perfect      # same as above (explicit name)
npm run test:screening:hallucinator # hallucinator mock, --failFast → exit 1
npm run test:screening:bad-json     # bad-json mock, --failFast → exit 1
npm run test:screening:all          # runs all three sequentially → exit 1

# ── Gold ──
npm run test:gold:perfect           # gold mock-perfect, --failFast → exit 0
npm run test:gold:hallucinator      # gold hallucinator, --failFast → exit 1 (hard fail)
npm run test:gold:bad-json          # gold bad-json, --failFast → exit 1 (hard fail)
npm run eval:gold                   # all 3 gold agents, no --failFast

# ── General ──
npm run eval:sample                 # screening run without --failFast
npm run eval -- [flags]             # ad-hoc run with any flags

# ── LaunchDarkly (requires env vars: LD_SDK_KEY, LD_AI_CONFIG_KEY, OPENAI_API_KEY) ──
npm run eval:ld:screening           # screening with LD agent
npm run eval:ld:gold                # gold with LD agent
npm run eval:ld:holdout             # holdout evaluation with LD agent
npm run eval:ld:curator-synth       # build synthetic curator dataset + evaluate
npm run eval:ld:scout:v0            # build Scout v0 dataset + evaluate Judge

# ── Validation & contract tests ──
npm run test:contract-v2            # 116 unit tests for Decision Contract v2
npm run test:curator                # curator layer smoke test
npm run test:curator-judge-e2e      # curator→judge e2e tests (15 gold + adversarial packets)

# ── Scout ──
npm run test:scout:v0               # Scout v0 smoke test (3 Salesforce samples)
npm run test:scout:salesforce       # Salesforce Scout v1 smoke test (fixture-backed)
npm run build:scout:v0:dataset      # build evaluator dataset from Scout v0 samples

# ── Dataset builders ──
npm run build:curator:synth         # build dataset from synthetic SignalBundles

# ── Reporting ──
npm run report:candidate            # generate candidate-eval.json from run outputs
```

## LaunchDarkly AI Config integration

The `launchdarkly` adapter retrieves prompt templates and model configuration from a LaunchDarkly AI Config, calls OpenAI with the interpolated messages, and returns the raw text for downstream validation/scoring.

### Required environment variables

| Variable | Description |
|----------|-------------|
| `LD_SDK_KEY` | LaunchDarkly server-side SDK key (Project settings → Environments) |
| `LD_AI_CONFIG_KEY` | AI Config key (can be overridden per-agent via `aiConfigKey` in config) |
| `OPENAI_API_KEY` | OpenAI API key for model invocation |

### Optional environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LD_CONTEXT_KIND` | `"user"` | Context kind sent to LaunchDarkly |
| `LD_CONTEXT_KEY` | `"elliot-eval"` | Context key sent to LaunchDarkly |

### Running with LaunchDarkly

```bash
# Set credentials
export LD_SDK_KEY="sdk-..."
export LD_AI_CONFIG_KEY="my-ai-config"
export OPENAI_API_KEY="sk-..."

# Run screening (uses data/gold.sample.jsonl)
npm run eval:ld:screening

# Run gold (uses data/elliot.gold.v0.1.jsonl)
npm run eval:ld:gold
```

### Agent config options

Per-agent overrides in the config file:

```json
{
  "name": "my-agent",
  "adapter": "launchdarkly",
  "config": {
    "aiConfigKey": "my-ai-config-key",
    "contextKey": "custom-context-key",
    "contextKind": "service"
  }
}
```

All fields are optional — env vars are used as fallbacks.

### How it works

1. The LD server-side SDK initializes once (singleton) and reuses the connection across all invocations
2. `completionConfig()` retrieves the AI Config variation for the given context, interpolating `{{ input_text }}` into the prompt template
3. The adapter calls OpenAI `chat.completions.create` with the interpolated messages and model parameters from the AI Config
4. Token usage and duration are reported back to LaunchDarkly via `tracker.trackOpenAIMetrics`
5. The raw model response is returned to the harness for AJV validation and scoring

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `LD_SDK_KEY environment variable is required` | Missing SDK key | `export LD_SDK_KEY="sdk-..."` |
| `OPENAI_API_KEY environment variable is required` | Missing OpenAI key | `export OPENAI_API_KEY="sk-..."` |
| `AI Config "..." is disabled or unavailable` | Config key not found, targeting returned fallback, or config is toggled off | Verify the AI Config key exists and is enabled in the LaunchDarkly dashboard |
| `waitForInitialization` timeout | LD_SDK_KEY is invalid or network unreachable | Check key validity and network access to LaunchDarkly |
| `ADAPTER_ERROR` in results | Any unhandled error in the adapter pipeline | Check `failure_details` in results.jsonl for the full error message |

## How to add new agents

Add a new entry to a config JSON file under `agents`:

```json
{ "name": "agent-name", "adapter": "mock", "config": { "responsesPath": "./path/to/responses.jsonl" } }
```

Mock response files are JSONL with one of two formats per line:
- `{"id": "case-id", "response": { ... }}` — wrapped in fenced JSON (normal)
- `{"id": "case-id", "rawText": "..."}` — passed through verbatim (for testing parse failures)

## How to add new datasets

1. Create a JSONL file following the dataset schema above
2. Tag screening rows with `"tags": ["screening"]`
3. Point your config or `--dataset` flag to the new file

## How to run regression tests

```bash
# CI: exit 0 only if all screening packets pass
npm run test:screening

# Local: run all mocks to verify both pass and fail behavior
npm run test:screening:all

# Decision Contract v2 unit tests (normalization, schema, scoring, EIC store)
npm run test:contract-v2

# Curator → Judge end-to-end (gold + adversarial packets)
npm run test:curator-judge-e2e
```

## How to generate a candidate evaluation report

```bash
# Generate from a specific run (or multiple runs):
npm run report:candidate -- --run out/<run-dir> --candidate <name> --model <model>

# Auto-detect the most recent run:
npm run report:candidate -- --candidate elliot-judge-v0.2 --model gpt-4o

# Multiple stages combined:
npm run report:candidate -- --run out/<screening-run> --run out/<gold-run> --candidate <name>
```

Output: `out/candidate-eval.json` (override with `--out <path>`)

## Scout → Curator → Judge evaluation loops

### Scout v0 (deterministic, Salesforce-shaped)

Scout v0 converts `SalesforceOpportunityInput` objects into `SignalBundle` records with conservative defaults (`"Unknown"` for uncertain fields). No external API calls.

```bash
# Smoke test: run 3 sample inputs through Scout → validate → render
npm run test:scout:v0

# Build evaluator dataset from Scout v0 samples:
npm run build:scout:v0:dataset

# Full loop: build dataset + evaluate Judge (requires LD env vars):
npm run eval:ld:scout:v0
```

### Salesforce Scout v1 (fixture-backed skeleton)

Scout v1 separates the raw Salesforce record shape (`SalesforceOpportunityRecord`) from the mapping logic, with a retrieval abstraction (`fetchOpportunityFromFixture`) shaped for future replacement with live SFDC API calls.

```bash
# Smoke test: load fixture → map to SignalBundle → validate → render
npm run test:scout:salesforce
```
