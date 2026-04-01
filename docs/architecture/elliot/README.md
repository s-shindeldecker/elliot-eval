# Elliot — Experimentation Impact Intelligence

Elliot is a role-first agent system that detects, validates, and communicates how experimentation influences revenue, expansion, competitive positioning, and AI adoption at LaunchDarkly.

The system converts fragmented internal signals into defensible, structured impact intelligence through a modular pipeline with strict contracts at each boundary. Every claim is evidence-backed, traceable, and conservatively constructed. Output is deterministic and auditable.

## Architecture diagram

The visual architecture overview is available as an interactive HTML diagram at [`../elliot-system-diagram.html`](../elliot-system-diagram.html) (viewable via GitHub Pages or locally in a browser).

## Canonical references

These two documents anchor the system. All other docs reference them:

| Document | Role |
|---|---|
| [Shared Enumerations](enums.md) | Single source of truth for all enum values used across Elliot docs, including Action, Confidence, and numeric scale definitions |
| [Decision Contract](decision-contract.md) | Strict JSON output schema (v2), evidence array, rationale shape, and output constraints |

Normalization warnings (see [decision contract warnings table](decision-contract.md#warnings-vs-failures)) are advisory messages emitted by the harness normalizer; they do not fail validation.

## Documentation index

| Document | Description |
|---|---|
| [Shared Enumerations](enums.md) | Action, IntelligenceStatus, CommercialOutcome, ImpactClassification, YesNoUnknown, StageBucket, Motion, Confidence, InfluenceStrength, ImpactPriority |
| [Job Description](job-description.md) | Role responsibilities, operating principles, governance, and accountability standards |
| [Pipeline Architecture](pipeline.md) | Scout → Curator → Judge → Scribe stage responsibilities and inter-stage contracts |
| [Decision Contract](decision-contract.md) | Strict JSON output schema, evidence-to-classification mapping, and output constraints |
| [Credibility Standards](credibility-standards.md) | Evidence tiers, minimum standards per ImpactClassification, downgrade triggers, and prohibited behaviors |
| [Lifecycle State Machine](lifecycle-state-machine.md) | IntelligenceStatus state definitions, allowed/disallowed transitions, and audit requirements |
| [Wisdom Integration](wisdom-integration.md) | Enterpret Knowledge Graph data sources, tools, Cypher patterns, and connection architecture |

## Related

- [ADR-0001: Scribe Separation](../../decisions/ADR-0001-scribe-separation.md) — Judge returns JSON only; Scribe handles persistence
