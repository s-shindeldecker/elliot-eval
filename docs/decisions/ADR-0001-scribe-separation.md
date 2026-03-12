# ADR-0001: Judge outputs decision JSON only; Scribe handles persistence

**Date:** 2026-03-12
**Status:** Accepted
**Deciders:** Scott Shindeldecker

## Context

The Elliot pipeline needs to both *decide* whether to create/update an EIC and *persist* that decision to spreadsheets, databases, and dashboards. Early prototypes combined both responsibilities in a single agent call, which made evaluation difficult: test runs would write to live artifacts, and changes to export format required re-prompting the model.

## Decision

Judge returns a strict JSON response (`human_summary` + `json.create_eic` / `json.eic`) and performs no persistence or tool calls. A separate Scribe component (to be built later) will consume Judge's output and handle all write operations.

## Options considered

### A. Judge writes directly to spreadsheet (rejected)

- Simpler single-step pipeline.
- But: every eval run would mutate real artifacts, making testing destructive.
- But: spreadsheet format changes would require prompt/schema changes in Judge.
- But: Judge would need write credentials, expanding the attack surface.

### B. Judge returns JSON only; Scribe persists later (chosen)

- Clean separation of concerns: decision vs. persistence.
- Eval harness can test Judge in isolation with static fixtures.
- Scribe can be swapped, versioned, or disabled independently.
- Judge needs zero external write permissions.

### C. Reporter absorbs Scribe role permanently (rejected)

- The existing eval harness reporter already writes `results.jsonl` and `summary.csv`.
- But: reporter is test infrastructure, not production persistence. Conflating the two would couple eval tooling to production export format.

## Consequences

- **Judge contract is frozen** at the current 22-field EIC schema. Any new persistence fields are Scribe's responsibility.
- **Scribe must be built** before the pipeline can write to production artifacts. Until then, eval harness reporter output is the only artifact.
- **Eval harness tests remain non-destructive** — no risk of polluting live spreadsheets during regression runs.
- **Latency** — adding Scribe introduces one more async step, but persistence is not latency-critical.
