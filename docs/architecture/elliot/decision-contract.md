# Decision Contract (v2)

> **Shared enums are defined in [enums.md](enums.md). Do not redefine them elsewhere.**

The decision contract defines the strict JSON output schema that Judge must produce for every input packet. All output is machine-readable, deterministic, and traceable to source evidence.

---

## Example Output (v2)

Every Judge response must conform to this structure. No additional fields are permitted at any nesting level (`additionalProperties: false`).

```json
{
  "human_summary": [
    "Evidence-grounded bullet summarizing the key finding",
    "Additional bullet (1–8 total, each non-empty, max 200 chars)"
  ],
  "rationale": {
    "because": [
      {
        "claim": "Experimentation is the deciding factor in the competitive evaluation",
        "evidence_refs": ["ev-1", "ev-2"]
      }
    ],
    "assumptions": ["Close window is under 30 days"],
    "open_questions": ["Budget allocation for experimentation tooling"]
  },
  "json": {
    "action": "CREATE",
    "eic": {
      "eic_id": "EIC-2026-001",
      "account": "Acme Corp",
      "opportunity": "Acme - Enterprise Expansion Q2",
      "opportunity_link": "https://salesforce/oppty/acme-001",
      "stage": "3 - Proposal",
      "stage_bucket": "Mid",
      "motion": "Expansion",
      "ae_owner": "Jane Smith",
      "experimentation_team_engaged": "Yes",
      "influence_strength": 4,
      "confidence": "High",
      "impact_classification": "CONFIRMED",
      "impact_priority": 4,
      "primary_influence_tag": "competitive_displacement",
      "secondary_tag": "platform_consolidation",
      "ai_configs_adjacent": "No",
      "competitive_mention": "Yes",
      "exec_sponsor_mentioned": "Yes",
      "summary_why_it_matters": "Experimentation is the deciding factor in a competitive evaluation against Statsig.",
      "evidence": [
        {
          "evidence_id": "ev-1",
          "source_type": "Gong",
          "url": "https://gong/call/abc-123",
          "timestamp_utc": "2026-03-01T14:00:00Z",
          "snippet": "They want built-in experimentation."
        },
        {
          "evidence_id": "ev-2",
          "source_type": "CRM",
          "url": "https://crm.internal/notes/exec-call",
          "snippet": null
        }
      ],
      "next_checkpoint": "2026-04-15",
      "status": "Active",
      "commercial_outcome": "OPEN"
    }
  }
}
```

When `action` is `NO_ACTION`, the `eic` field must be `null`.
When `action` is `CREATE` or `UPDATE`, all EIC fields are required.

---

## Rationale

The optional `rationale` object provides structured, evidence-referenced reasoning. It is validated when present but not required for backward compatibility.

| Field | Type | Constraints |
|---|---|---|
| `because` | `Array<{ claim: string; evidence_refs: string[] }>` | 1–10 items. Each `claim` non-empty. Each `evidence_refs` non-empty and must reference `evidence_id` values in `eic.evidence`. |
| `assumptions` | `string[]` | Assumptions the Judge made beyond what evidence directly supports. |
| `open_questions` | `string[]` | Unresolved questions that could change the assessment. |

Dangling `evidence_refs` (IDs not present in `eic.evidence`) emit a `dangling_evidence_ref` warning.

---

## Enumeration Reference

All enumerations used in the decision schema are defined in **[enums.md](enums.md)**. The following fields reference those enums:

| Field | Enum | Runtime values |
|---|---|---|
| `action` | Action | `CREATE`, `UPDATE`, `NO_ACTION` |
| `impact_classification` | ImpactClassification | `CONFIRMED`, `PROBABLE`, `HYPOTHESIZED`, `NO_IMPACT` |
| `commercial_outcome` | CommercialOutcome | `OPEN`, `CLOSED_WON`, `CLOSED_LOST` |
| `stage_bucket` | StageBucket | `Early`, `Mid`, `Late`, `Closed` |
| `motion` | Motion | `Net-new`, `Expansion`, `Renewal`, `Other` |
| `confidence` | Confidence | `Low`, `Medium`, `High` |
| `experimentation_team_engaged` | YesNoUnknown | `Yes`, `No`, `Unknown` |
| `ai_configs_adjacent` | YesNoUnknown | `Yes`, `No`, `Unknown` |
| `competitive_mention` | YesNoUnknown | `Yes`, `No`, `Unknown` |
| `exec_sponsor_mentioned` | YesNoUnknown | `Yes`, `No`, `Unknown` |
| `influence_strength` | InfluenceStrength | Integer 1–5, or `null` for legacy payloads |
| `impact_priority` | ImpactPriority | Integer 1–5 |
| `status` | EicStatus | `Active`, `Monitoring`, `Under Review`, `CW`, `CL` |

---

## Evidence Array

Evidence is a required array of structured references. Each item must include:

| Field | Type | Required | Notes |
|---|---|---|---|
| `evidence_id` | `string` | Yes | Unique within the EIC. Referenced by `rationale.because[].evidence_refs`. |
| `source_type` | `string` | Yes | e.g. `Gong`, `Zoom`, `Slack`, `CRM`, `Salesforce` |
| `url` | `string` | Yes | Must appear verbatim in the input packet. URLs not found trigger `HALLUCINATED_CITATION`. |
| `timestamp_utc` | `string \| null` | No | ISO 8601 if available. |
| `snippet` | `string \| null` | No | Short quoted excerpt from the source. |

Legacy payloads with `evidence_citation_1` / `evidence_citation_2` are normalized to this array by the harness (with synthetic IDs `ev-legacy-1`, `ev-legacy-2`).

---

## Evidence-to-Classification Mapping

Classification decisions must be grounded in evidence tier (see [Credibility Standards](credibility-standards.md)).

| Evidence tier present | Allowed ImpactClassification | Allowed InfluenceStrength | Allowed Confidence |
|---|---|---|---|
| Tier 1 only (direct quotes, recorded calls) | `CONFIRMED` or `PROBABLE` | 1–5 | `High` or `Medium` |
| Tier 2 only (secondhand reports, CRM notes) | `PROBABLE` or `HYPOTHESIZED` | 1–4 | `Medium` only |
| Tier 3 only (inferred, no explicit mention) | `HYPOTHESIZED` only | 1–2 | `Medium` only |
| Mixed Tier 1 + Tier 2 | `CONFIRMED` or `PROBABLE` | 1–5 | `High` or `Medium` |
| No qualifying evidence | `NO_IMPACT` (set `action: "NO_ACTION"`) | — | — |

If evidence supports `action: "CREATE"` but all evidence is Tier 3, Judge must set `impact_classification: "HYPOTHESIZED"`, `influence_strength ≤ 2`, and `confidence: "Medium"`, and include a risk flag in `human_summary`.

---

## Confidence × Classification Coupling (Model B)

The harness validates confidence/classification pairings as warnings (not hard failures):

| ImpactClassification | Allowed Confidence values |
|---|---|
| `CONFIRMED` | `Medium`, `High` |
| `PROBABLE` | `Low`, `Medium`, `High` |
| `HYPOTHESIZED` | `Low`, `Medium` |
| `NO_IMPACT` | `Medium`, `High` |

Violations emit a `classification_confidence_mismatch` warning.

---

## Output Constraints

1. **JSON only.** Judge must not produce prose-only responses, markdown, or tool calls. The entire response must contain a parseable JSON object matching this schema.
2. **Evidence array required.** The `evidence` array must contain at least one item when `action` is `CREATE` or `UPDATE`. Every `url` must appear verbatim in the input packet. URLs not found trigger `HALLUCINATED_CITATION`.
3. **Risk flags.** When ambiguity exists (conflicting evidence, disputed signal, Tier 3-only evidence), Judge must:
   - Include a `human_summary` bullet explicitly noting the ambiguity.
   - Set `confidence: "Medium"`.
   - Cap `influence_strength` according to the evidence tier table above.
4. **No speculation.** Fields must reflect what the evidence supports, not what the opportunity might become. Future-only experimentation mentions do not justify `action: "CREATE"`.
5. **Determinism.** Given identical input packets, Judge must produce functionally equivalent output (same action decision, same classification ranges, same evidence references).
6. **secondary_tag format.** If non-null, must be snake_case (2–4 words, max 32 characters, pattern `^[a-z0-9]+(?:_[a-z0-9]+){1,3}$`).
7. **human_summary invariants.** Array of 1–8 bullets, each non-empty and ≤ 200 characters. No case-insensitive duplicates.

---

## Warnings vs Failures

The evaluation harness distinguishes hard validation failures (which fail the case) from advisory warnings (which are recorded but do not affect pass/fail). Warnings surface normalization decisions, coupling violations, and data quality issues.

### Normalization Warnings

Emitted by the v1→v2 normalizer when processing legacy payloads:

| Warning code | Trigger | Meaning |
|---|---|---|
| `LEGACY_INFLUENCE_ZERO` | Legacy payload has `influence_strength: 0` | Value was coerced to `null`. v2 producers should send 1–5 or omit the field. |
| `IMPACT_CLASSIFICATION_DEFAULTED` | `impact_classification` field missing on a CREATE/UPDATE payload | Defaulted to `HYPOTHESIZED` (conservative). v2 producers should always set this explicitly. |
| `ACTION_INFERRED_UPDATE` | `create_eic: true` with `eic_id` matching `^EIC-` prefix | Inferred `action: "UPDATE"` instead of `"CREATE"`. v2 producers should set `action` explicitly. |

### Validation Warnings

Emitted during schema and cross-field checks:

| Warning code | Trigger | Meaning |
|---|---|---|
| `classification_confidence_mismatch` | Confidence value outside Model B coupling rules for the given ImpactClassification | See Confidence × Classification Coupling table above. |
| `human_summary_grounding` | `rationale.because` contains no `evidence_refs` | Summary may not be evidence-grounded. |
| `dangling_evidence_ref` | `rationale.because[].evidence_refs` contains an ID not present in `eic.evidence` | Rationale references nonexistent evidence. |
| `duplicate_human_summary` | Two `human_summary` bullets match (case-insensitive) | Redundant bullets detected. |

---

## Non-Goals for the Decision Layer

These behaviors are explicitly outside Judge's scope:

1. **No persistence.** Judge does not write to spreadsheets, databases, dashboards, or any external artifact. Persistence is Scribe's responsibility.
2. **No tool calls.** Judge does not invoke APIs, MCP servers, file systems, or any external service. All evidence must already be present in the input packet.
3. **No narrative outside JSON.** Judge does not produce standalone prose, commentary, or explanatory text outside the JSON structure. The `human_summary` array is the only place for natural language, and it must be inside the JSON.
4. **No guessing missing fields.** If the input packet does not contain sufficient information to populate a field, Judge must use `Unknown` (for YesNoUnknown fields) or `null` (for nullable fields). Fabricating plausible values is a credibility violation.
5. **No lifecycle management.** Judge sets `status` based on the current evidence assessment. It does not execute state transitions, enforce transition rules, or manage audit trails. Lifecycle enforcement is downstream.
6. **Warnings are advisory.** Warnings do not fail validation by default; the harness emits them for visibility. Some warnings may later be promoted to errors.
