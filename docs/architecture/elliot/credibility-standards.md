# Credibility Standards

> **Shared enums are defined in [enums.md](enums.md). Do not redefine them elsewhere.**

This document defines the evidence tiers, minimum standards for ImpactClassification, downgrade triggers, and prohibited behaviors that govern how experimentation impact claims are constructed and maintained.

All classifications must be traceable, conservative, and reproducible.

---

## Evidence Tiers

### Tier 1 — Direct, Verifiable Evidence

First-party evidence from recorded or attributable sources. Highest credibility.

| Source type | Examples |
|---|---|
| Recorded calls | Gong, Zoom recordings with timestamps |
| Direct quotes | Verbatim text from prospect/customer with attribution |
| CRM records | Salesforce opportunity notes entered by deal owner |
| Written commitments | Email or Slack messages from buyer stakeholders |

**Requirements:**
- Must include a source link that is accessible and verifiable.
- Timestamp or date must be present or inferable.
- Quote or paraphrase must be attributable to a named individual or role.

### Tier 2 — Secondhand or Summarized Evidence

Evidence reported by internal stakeholders but not directly captured from the buyer.

| Source type | Examples |
|---|---|
| AE verbal reports | "The customer mentioned experimentation in the call" (no recording) |
| Slack summaries | Internal thread summarizing a customer conversation |
| Meeting notes | Unrecorded meeting summaries written after the fact |

**Requirements:**
- Must include a source link (even if to an internal thread or note).
- The reporting person must be identified.
- Cannot be used alone to justify InfluenceStrength > 4 or Confidence `HIGH`.

### Tier 3 — Inferred or Contextual Evidence

No explicit experimentation mention; influence is inferred from surrounding signals.

| Source type | Examples |
|---|---|
| Industry pattern | "Companies in this segment typically adopt experimentation at this stage" |
| Adjacent product usage | AI Configs usage suggesting experimentation intent |
| Behavioral inference | Increased engagement with experimentation documentation |

**Requirements:**
- Must be explicitly labeled as inferred in any `human_summary` bullet.
- Cannot alone justify `create_eic: true` unless accompanied by at least one Tier 1 or Tier 2 item.
- Maximum InfluenceStrength of 2 when Tier 3 is the only evidence.

---

## Minimum Standards Per ImpactClassification

| ImpactClassification | Minimum evidence | Allowed Confidence | Max InfluenceStrength |
|---|---|---|---|
| `CONFIRMED` | At least one Tier 1 item with no contradictions | `HIGH` or `MEDIUM` | 5 |
| `PROBABLE` | At least one Tier 1 or Tier 2 item | `HIGH` or `MEDIUM` | 5 (4 if Tier 2 only) |
| `HYPOTHESIZED` | Tier 2 or Tier 3 only; flagged as inferred | `MEDIUM` only | 2 |
| `NO_IMPACT` | No qualifying evidence, or only aspirational/future-only mentions | — | — |

### InfluenceStrength Floors

| Scenario | Minimum InfluenceStrength |
|---|---|
| Competitive displacement cited as deciding factor | 4 |
| Exec sponsor explicitly mandates experimentation | 3 |
| Experimentation team engaged, no other signal | 2 |
| AI Configs adjacent, no explicit experimentation mention | 2 |
| Future-only or aspirational mention | 0 (do not create EIC) |

---

## How to Apply Tiers

When evaluating an input packet, apply evidence tiers using these steps:

1. **Identify all evidence items.** Each evidence item in the input packet has a source type and source link. Classify each item as Tier 1, Tier 2, or Tier 3 based on the definitions above.
2. **Determine the highest tier present.** The strongest single evidence item sets the ceiling for ImpactClassification and Confidence.
3. **Apply conservative defaults.** If uncertain about an evidence item's tier, classify it one tier lower. If a Tier 1 source cannot be verified (e.g., recording link is described but not directly attributable), treat it as Tier 2.
4. **Check for contradictions.** If any evidence item contradicts the experimentation relevance claim (e.g., "AE disputes experimentation value"), Confidence must be capped at `MEDIUM` regardless of tier, and a risk flag must appear in `human_summary`.
5. **Map to ImpactClassification.** Use the "Minimum Standards" table above to determine the allowed ImpactClassification for the evidence profile.
6. **Set InfluenceStrength within bounds.** Use the InfluenceStrength floors table and the evidence-to-classification mapping in [Decision Contract](decision-contract.md) to set an appropriate value.
7. **When in doubt, do not create.** If the evidence does not clearly support experimentation influence, set `create_eic: false` and ImpactClassification `NO_IMPACT`.

---

## Downgrade Triggers

An existing classification must be downgraded when any of the following occur:

| Trigger | Action |
|---|---|
| Deal owner disputes the experimentation relevance | Move IntelligenceStatus to `UNDER_REVIEW`; reduce InfluenceStrength by at least 1 |
| Source link becomes inaccessible or is retracted | Reduce Confidence to `MEDIUM`; flag in `human_summary` |
| New evidence contradicts prior assessment | Re-evaluate from scratch; do not preserve prior InfluenceStrength if unsupported |
| CommercialOutcome changes to `CLOSED_LOST` without experimentation being a factor | Move IntelligenceStatus to `FINALIZED`; preserve original assessment as historical |
| Evidence reclassified from Tier 1 to Tier 2 (e.g., recording unavailable) | Recalculate allowed ImpactClassification and ranges per tier table |

### Downgrade process

1. Record the reason for downgrade in `human_summary`.
2. Adjust InfluenceStrength and Confidence to the new evidence floor.
3. Update IntelligenceStatus if the lifecycle state changes (see [Lifecycle State Machine](lifecycle-state-machine.md)).
4. Preserve the previous classification in audit history (Scribe responsibility).

---

## Prohibited Behaviors

1. **No inflation.** Do not upgrade InfluenceStrength or Confidence beyond what the evidence tier supports. If Tier 2 is the strongest evidence, Confidence must be `MEDIUM`.
2. **No hallucination.** Every URL in `evidence_citation_1` and `evidence_citation_2` must appear verbatim in the input packet. Fabricated or paraphrased URLs are a hard failure.
3. **No retroactive escalation.** A case that was previously `MEDIUM` Confidence cannot be upgraded to `HIGH` without new Tier 1 evidence. The upgrade must cite the new evidence.
4. **No speculation as fact.** Phrases like "likely", "probably", or "suggests" in evidence do not support InfluenceStrength ≥ 4 or Confidence `HIGH`.
5. **No narrative-only claims.** Every classification must map to specific, citable evidence. A compelling story without traceable support is not a valid impact case.
6. **No suppression of negative signals.** If the input packet contains evidence against experimentation relevance (e.g., "AE disputes experimentation value"), it must be reflected in the assessment. Omitting contradictory evidence is a credibility violation.
