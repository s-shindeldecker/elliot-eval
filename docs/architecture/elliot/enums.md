# Shared Enumerations

This is the single source of truth for all enumerations used across Elliot documentation. Other documents reference these definitions but must not redefine them.

---

## Action

Determines what the Judge decision implies for EIC persistence downstream.

| Value | Description |
|---|---|
| `CREATE` | A new Experimentation Impact Card should be created. |
| `UPDATE` | An existing EIC (identified by `eic_id`) should be updated with new assessment data. |
| `NO_ACTION` | No EIC creation or update warranted. |

**Backward compatibility:** Legacy payloads with `create_eic: true` are mapped to `CREATE` (or `UPDATE` if `eic_id` matches `^EIC-`). `create_eic: false` maps to `NO_ACTION`. The normalizer emits `ACTION_INFERRED_UPDATE` when the UPDATE inference is applied.

---

## IntelligenceStatus

Tracks the intelligence lifecycle state of an Experimentation Impact Card. These states are owned by the Elliot pipeline and govern what actions are permitted on a case.

| Value | Description |
|---|---|
| `ACTIVE` | Under active monitoring. Evidence supports ongoing experimentation influence. New signals are expected and should trigger re-evaluation. |
| `MONITORING` | Stable case; no new signals expected short-term. The opportunity is progressing but experimentation relevance is settled. Periodic review only. |
| `UNDER_REVIEW` | Disputed, ambiguous, or contradicted by new evidence. Classification is frozen pending re-evaluation. No outward claims may be made until resolved. |
| `FINALIZED` | Assessment is complete and the intelligence record is locked. No further classification changes are permitted. Finalization occurs when a CommercialOutcome is recorded or when the case is administratively closed. |

See [Lifecycle State Machine](lifecycle-state-machine.md) for allowed transitions.

> **Runtime note:** The runtime schema field is `status` with values `Active`, `Monitoring`, `Under Review`, `CW`, `CL`. The alias `intelligence_status` is accepted during normalization and mapped to `status`.

---

## CommercialOutcome

Tracks the commercial result of the associated opportunity. This value is sourced from CRM and is **not** an intelligence lifecycle state. It is recorded alongside IntelligenceStatus but does not drive state transitions.

| Value | Description |
|---|---|
| `OPEN` | Opportunity is still active in the pipeline. |
| `CLOSED_WON` | Opportunity converted. |
| `CLOSED_LOST` | Opportunity lost. |

CommercialOutcome is set by CRM sync or manual update. When CommercialOutcome changes to `CLOSED_WON` or `CLOSED_LOST`, the EIC's IntelligenceStatus should transition to `FINALIZED`.

---

## ImpactClassification

Classifies the assessed level of experimentation influence on an opportunity. Must be grounded in evidence tier (see [Credibility Standards](credibility-standards.md)).

| Value | Description | Minimum evidence |
|---|---|---|
| `CONFIRMED` | Experimentation was a verified deciding factor or primary driver. | At least one Tier 1 evidence item; no contradictions. |
| `PROBABLE` | Evidence strongly suggests experimentation influence but with some ambiguity. | At least one Tier 1 or Tier 2 item; minor ambiguity acceptable. |
| `HYPOTHESIZED` | Experimentation relevance is inferred but not explicitly supported. | Tier 2 or Tier 3 only; must be flagged as inferred in `human_summary`. |
| `NO_IMPACT` | No qualifying experimentation signal detected. | No qualifying evidence, or only aspirational/future-only mentions. |

When `ImpactClassification` is `NO_IMPACT`, Judge must set `action: "NO_ACTION"`.

---

## YesNoUnknown

Used for binary-with-uncertainty fields where evidence may be absent or inconclusive.

| Value | When to use |
|---|---|
| `Yes` | Evidence explicitly confirms the condition. |
| `No` | Evidence explicitly denies the condition. |
| `Unknown` | Insufficient evidence to determine. Do not guess. |

**Applies to:** `experimentation_team_engaged`, `ai_configs_adjacent`, `competitive_mention`, `exec_sponsor_mentioned`.

---

## StageBucket

Normalized deal stage for consistent scoring and reporting.

| Value | Description |
|---|---|
| `Early` | Discovery, qualification, or initial validation. |
| `Mid` | Proof of value, proposal, or active evaluation. |
| `Late` | Executive approval, paper process, or final negotiation. |
| `Closed` | Opportunity has reached a terminal commercial state. |

---

## Motion

Revenue motion type describing how experimentation influence manifests in the opportunity.

| Value | Description |
|---|---|
| `Net-new` | Net-new customer acquisition where experimentation is a factor. |
| `Expansion` | Existing customer expanding usage or tier, driven by experimentation need. |
| `Renewal` | Customer renewal where experimentation relevance influences retention or tier. |
| `Other` | Motion type does not fit the above categories. |

---

## Confidence

Judge's confidence in the overall impact classification.

| Value | Criteria |
|---|---|
| `High` | Multiple Tier 1 evidence items; no contradictions; clear signal. |
| `Medium` | Mixed evidence tiers; some ambiguity; reasonable inference. |
| `Low` | Weak or inferred evidence only; high uncertainty. |

Tier 2-only evidence caps Confidence at `Medium`. See [Credibility Standards](credibility-standards.md) for full rules.

See [Decision Contract — Confidence × Classification Coupling](decision-contract.md#confidence--classification-coupling-model-b) for allowed pairings.

---

## InfluenceStrength (1–5)

Integer score reflecting how strongly experimentation influenced the opportunity.

| Range | Guidance |
|---|---|
| 1–2 | Mentioned but not a driver; aspirational or future-only. |
| 3 | Moderate influence; contributing factor but not deciding. |
| 4–5 | Strong or deciding influence; competitive displacement, exec mandate. |

**Allowed values:** integer 1–5, or `null` for legacy-normalized payloads. Legacy payloads may present 0; the normalizer coerces 0 → `null` and emits a `LEGACY_INFLUENCE_ZERO` warning. v2 producers should send 1–5 or omit the field to indicate unknown.

---

## ImpactPriority (1–5)

Integer score reflecting urgency and strategic importance.

| Range | Guidance |
|---|---|
| 1–2 | Low urgency; informational value only. |
| 3 | Moderate; worth tracking but not time-sensitive. |
| 4–5 | High urgency; close window, competitive pressure, or exec attention. |

**Allowed values:** integer 1–5. Unlike InfluenceStrength, 0 is never valid for ImpactPriority.
