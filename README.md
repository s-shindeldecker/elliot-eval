# elliot-eval

**Elliot Evaluation Harness** — Experimentation Line-of-sight & Impact Observation Tracker

A CLI tool that runs a gold dataset of evaluation packets through multiple agent candidates, validates strict JSON output against the Elliot EIC schema, scores via deterministic rule-based checks, and produces `results.jsonl` + `summary.csv` + console summary.

## Architecture docs

- [Elliot documentation index](docs/architecture/elliot/README.md) — full documentation set
- [Pipeline overview](docs/architecture/elliot/pipeline.md) — Scout → Curator → Judge → Scribe responsibilities and contracts
- [ADR-0001: Scribe separation](docs/decisions/ADR-0001-scribe-separation.md) — why Judge returns JSON only

## Quick start

```bash
npm install
npm run test:screening          # CI regression gate (mock-perfect, exit 0)
npm run eval:sample             # same dataset, no --failFast
```

## Dataset schema

Each line in the JSONL dataset must conform to:

```jsonc
{
  "id": "string",               // unique case identifier
  "input_text": "string",       // full text fed to the agent
  "expected": {
    "create_eic": true | false,  // required — primary decision to score
    "eic": {                     // optional — only when create_eic=true
      // exact-match fields (FIELD_MISMATCH if wrong)
      "status": "Active" | "Monitoring" | "Under Review" | "CW" | "CL",
      "primary_influence_tag": "string",
      "secondary_tag": "string | null",
      "ai_configs_adjacent": "Yes" | "No" | "Unknown",
      "competitive_mention": "Yes" | "No" | "Unknown",
      "exec_sponsor_mentioned": "Yes" | "No" | "Unknown",
      "experimentation_team_engaged": "Yes" | "No" | "Unknown",
      "stage_bucket": "Early" | "Mid" | "Late" | "Closed",
      "motion": "Net-new" | "Expansion" | "Renewal" | "Other",

      // range/set checks (RANGE_VIOLATION if outside)
      "influence_strength_range": [min, max],   // integers within 0..5
      "impact_priority_range": [min, max],       // integers within 1..5
      "confidence_allowed": ["Medium", "High"]   // allowed values
    }
  },
  "tags": ["screening"]         // optional — used for stage filtering
}
```

Only fields present in `expected.eic` are scored. Omitted fields are not checked.

## Agent output contract

Every agent must return a response containing JSON that matches:

```jsonc
{
  "human_summary": ["string"],  // 1–8 non-empty bullet strings
  "json": {
    "create_eic": true | false,
    "eic": { /* full EIC object */ } | null
  }
}
```

When `create_eic=true`, `eic` must be a full object with all 22 required fields.
When `create_eic=false`, `eic` must be `null`.

See `src/schemas/agent-response.ts` for the exact AJV schema.

## Failure codes

| Code | Trigger |
|------|---------|
| `JSON_PARSE_ERROR` | No parseable JSON found in agent response |
| `SCHEMA_INVALID` | JSON parsed but fails AJV schema validation |
| `DECISION_MISMATCH` | `create_eic` does not match expected |
| `FIELD_MISMATCH` | Exact-match field mismatch (status, tags, enums, booleans) |
| `RANGE_VIOLATION` | `influence_strength`, `impact_priority` outside range, or `confidence` not in allowed set |
| `HALLUCINATED_CITATION` | URL in `evidence_citation_1`/`evidence_citation_2` not found verbatim in `input_text` |
| `MISSING_REQUIRED_FIELD` | `create_eic=true` but agent returned `eic: null` |
| `ADAPTER_ERROR` | Adapter returned an error (e.g. LD stub missing env vars) |
| `TIMEOUT` | Adapter invocation exceeded `--timeoutMs` |
| `CONFIG_ERROR` | Dataset row has malformed expected object |

## Pass/fail rules

**Screening stage:** An agent passes only if every case passes (zero failures of any kind). `--failFast` aborts on the first failure.

**Gold stage:** An agent passes only if **both** conditions are met:

1. `passRate >= threshold` (default 85%)
2. `hard_fail_count == 0` — zero results containing any of the **hard-gate failure codes**:
   `HALLUCINATED_CITATION`, `SCHEMA_INVALID`, `JSON_PARSE_ERROR`, `ADAPTER_ERROR`, `CONFIG_ERROR`, `TIMEOUT`

Soft failures (`DECISION_MISMATCH`, `FIELD_MISMATCH`, `RANGE_VIOLATION`, `MISSING_REQUIRED_FIELD`) reduce pass rate but do not trigger the hard gate.

## Fixture configs

Use the **stable fixture configs** for local testing and CI. Each targets a specific mock agent:

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

Scripts use `--agents` to filter from the gold config.

> **Note:** `fixtures/eval-config.json` is a legacy convenience file and may be overwritten during development. Do not rely on it for scripted tests. Use the named configs above instead.

## npm scripts

```bash
# Screening
npm run test:screening              # CI gate: mock-perfect, --failFast → exit 0
npm run test:screening:perfect      # same as above (explicit name)
npm run test:screening:hallucinator # hallucinator mock, --failFast → exit 1
npm run test:screening:bad-json     # bad-json mock, --failFast → exit 1
npm run test:screening:all          # runs all three sequentially → exit 1

# Gold
npm run test:gold:perfect           # gold mock-perfect, --failFast → exit 0
npm run test:gold:hallucinator      # gold hallucinator, --failFast → exit 1 (hard fail: HALLUCINATED_CITATION)
npm run test:gold:bad-json          # gold bad-json, --failFast → exit 1 (hard fail: JSON_PARSE_ERROR + SCHEMA_INVALID)
npm run eval:gold                   # all 3 gold agents, no --failFast

npm run eval:sample                 # screening run without --failFast
npm run eval -- [flags]             # ad-hoc run with any flags

# LaunchDarkly (requires env vars: LD_SDK_KEY, LD_AI_CONFIG_KEY, OPENAI_API_KEY)
npm run eval:ld:screening           # screening with LD agent
npm run eval:ld:gold                # gold with LD agent
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
