# Lifecycle State Machine

> **Shared enums are defined in [enums.md](enums.md). Do not redefine them elsewhere.**

Every Experimentation Impact Card (EIC) has an IntelligenceStatus that governs what actions are permitted, what transitions are valid, and what audit records are required.

This document covers IntelligenceStatus transitions only. CommercialOutcome is a separate dimension sourced from CRM — see the section at the end.

---

## IntelligenceStatus States

| State | Description |
|---|---|
| `ACTIVE` | Under active monitoring. Evidence supports ongoing experimentation influence. New signals are expected and should trigger re-evaluation. |
| `MONITORING` | Stable case; no new signals expected short-term. The opportunity is progressing but experimentation relevance is settled. Periodic review only. |
| `UNDER_REVIEW` | Disputed, ambiguous, or contradicted by new evidence. Classification is frozen pending re-evaluation. No outward claims may be made about this case until resolved. |
| `FINALIZED` | Assessment is complete and the intelligence record is locked. No further classification changes are permitted. |

---

## Allowed Transitions

```
ACTIVE ──────► MONITORING       (signals stabilize, no new evidence expected)
ACTIVE ──────► UNDER_REVIEW     (dispute raised, evidence contradicted, or ambiguity identified)
ACTIVE ──────► FINALIZED        (commercial outcome recorded, or case administratively closed)

MONITORING ──► ACTIVE           (new signal detected, re-evaluation triggered)
MONITORING ──► UNDER_REVIEW     (dispute raised or evidence retracted)
MONITORING ──► FINALIZED        (commercial outcome recorded, or case administratively closed)

UNDER_REVIEW ► ACTIVE           (dispute resolved in favor of the case; evidence reconfirmed)
UNDER_REVIEW ► MONITORING       (dispute resolved; case is valid but no further action needed)
UNDER_REVIEW ► FINALIZED        (dispute resolved against the case, or commercial outcome recorded)
```

### Transition summary table

| From | To | Trigger |
|---|---|---|
| `ACTIVE` | `MONITORING` | No new signals for review period; evidence stable |
| `ACTIVE` | `UNDER_REVIEW` | Deal owner dispute, contradictory evidence, or evidence retraction |
| `ACTIVE` | `FINALIZED` | CommercialOutcome changes to `CLOSED_WON` or `CLOSED_LOST`, or case is administratively closed |
| `MONITORING` | `ACTIVE` | New experimentation signal detected |
| `MONITORING` | `UNDER_REVIEW` | Dispute or evidence retraction |
| `MONITORING` | `FINALIZED` | CommercialOutcome changes to `CLOSED_WON` or `CLOSED_LOST`, or case is administratively closed |
| `UNDER_REVIEW` | `ACTIVE` | Dispute resolved; evidence reconfirmed with Tier 1 support |
| `UNDER_REVIEW` | `MONITORING` | Dispute resolved; case valid but low activity |
| `UNDER_REVIEW` | `FINALIZED` | Dispute resolved against the case, or CommercialOutcome recorded |

---

## Disallowed Transitions

| Transition | Reason |
|---|---|
| `FINALIZED` → any state | `FINALIZED` is a terminal state. The historical record must not be altered. If an error is discovered, a correction record is appended — the original is never overwritten. Reopening requires a new EIC with a new ID. |
| `UNDER_REVIEW` → `FINALIZED` (via `CLOSED_WON` without dispute resolution) | A disputed case cannot be finalized as confirmed influence. The dispute must first be resolved (returning to `ACTIVE` or `MONITORING`) before finalization. Exception: `CLOSED_LOST` may finalize directly from `UNDER_REVIEW`. |
| Any state → `ACTIVE` (without new evidence) | Returning to `ACTIVE` requires a documented trigger (new signal, new evidence). Administrative convenience is not a valid reason. |

---

## CommercialOutcome (Separate Dimension)

CommercialOutcome (`OPEN`, `CLOSED_WON`, `CLOSED_LOST`) is **not** an intelligence lifecycle state. It is a CRM-sourced property recorded alongside IntelligenceStatus.

**How CommercialOutcome interacts with IntelligenceStatus:**

- When CommercialOutcome changes from `OPEN` to `CLOSED_WON` or `CLOSED_LOST`, this triggers a transition of IntelligenceStatus to `FINALIZED` (subject to the dispute-resolution constraint above).
- CommercialOutcome does not replace IntelligenceStatus. A `FINALIZED` EIC retains its last ImpactClassification, InfluenceStrength, and Confidence as historical record.
- CommercialOutcome is never set by Judge. It is provided by CRM sync or manual operator update.

---

## Audit Requirements

Every IntelligenceStatus transition must produce an audit record. Until Scribe is implemented, audit responsibility falls on the pipeline operator reviewing `results.jsonl` and `summary.csv`.

### Required audit fields per transition

| Field | Description |
|---|---|
| `eic_id` | The EIC being transitioned |
| `previous_status` | IntelligenceStatus before the transition |
| `new_status` | IntelligenceStatus after the transition |
| `trigger` | What caused the transition (new evidence, dispute, CRM update, administrative close) |
| `evidence_ids` | Source links supporting the transition decision |
| `timestamp` | ISO 8601 timestamp of the transition |
| `actor` | Who or what initiated the transition (agent ID, human reviewer, CRM sync) |

### Audit rules

1. **No silent transitions.** Every IntelligenceStatus change must have a recorded trigger and timestamp. If the trigger is missing, the transition is invalid.
2. **`FINALIZED` is immutable.** Once an EIC reaches `FINALIZED`, no fields may be modified. Corrections are appended as separate records.
3. **`UNDER_REVIEW` freezes outward claims.** While in `UNDER_REVIEW`, the EIC must not be included in impact summaries, dashboards, or leadership reports as confirmed influence. It may appear in "pending review" sections only.
4. **Downgrade trail required.** When `influence_strength` or `confidence` is reduced during a transition, the previous values and the reason for reduction must be recorded.
5. **Dispute resolution is explicit.** Moving out of `UNDER_REVIEW` requires a documented resolution: either reconfirmed (with evidence citation) or rejected (with reason). The resolution must be recorded before the transition executes.
