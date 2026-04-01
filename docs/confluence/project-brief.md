# Elliot – Project Brief

> Source of truth for details: [Full build log](link-to-build-log)

## 1. Purpose

LaunchDarkly has consistently struggled to maintain reliable visibility into the business impact of Experimentation, especially through the lens of deals and account motion. Historically, sales attribution has been inconsistent. Upcoming pricing changes will further reduce visibility by removing a distinct ARR line item for experimentation.

If we cannot continuously demonstrate how experimentation contributes to revenue motion, expansion, strategic positioning, and AI-related adoption, we risk losing prioritization and internal support—not due to lack of customer value, but due to lack of visibility.

This project addresses that need by building Elliot, an AI teammate focused on detecting and validating experimentation impact signals.

More broadly, this effort is exploring a repeatable process for onboarding AI teammates into real workflows—including how to define their role, evaluate their performance, and operate them reliably over time.

## 2. Current State (Snapshot)

**Last updated: Mar 31, 2026**

Elliot now has a **working end-to-end pipeline** from CLI query through live data to scored intelligence output:

```
User Query → Scout (LLM Agent) → Wisdom Tools → Curator (Deterministic) → Judge (LLM Scorer) → Scored EIC
```

### What's Working

- **Scout** operates as an LLM agent (via LD AI Configs) with 6 Wisdom tools that query the Enterpret Knowledge Graph for Gong calls, Zendesk tickets, Slack mentions, feedback themes, and account data
- **Curator** deterministically transforms raw tool results into a structured `SignalBundle`, inferring 10 `OpportunitySnapshot` fields from Gong Salesforce-linked data and feedback themes (opportunity name, stage, amount, AE owner, stage bucket, experimentation engaged, AI configs adjacent, competitive mention, EIC ID)
- **Judge** scores curated packets via a separate LD AI Config with constrained influence tag taxonomy, engagement velocity interpretation, and feedback theme calibration
- **CLI harness** (`npm run agent:cli`) for interactive testing — auto-saves Curator packets for replay
- **Judge replay harness** (`npm run judge:test`) for A/B testing prompt variations against saved packets
- **Evaluation harness** with 10 gold test cases, adversarial packets, and regression testing across prompt changes

### Data Sources (via Enterpret/Wisdom MCP)

| Source | Records | What Elliot Sees |
|--------|---------|-----------------|
| Gong | ~12,500 | Call transcripts, participants, Salesforce opportunity linkage (name, stage, amount) |
| Zendesk | ~15,500 | Support tickets, status |
| Slack | ~2,000 | Internal messages from 21 indexed channels |
| Feedback themes | Aggregated | NLP-derived themes across all sources (complaints, praise, improvements, help requests) |

### Latest Eval Results (Mar 31, 2026)

Gold eval (10 cases): **All action decisions correct or defensibly close**. 4/10 pass rate is due to tag vocabulary calibration, numeric range tuning, and a schema strictness issue (`eic_id: null`), not decision quality. All 4 negative cases pass clean — the Judge does not over-trigger on weak signals.

## 3. What Elliot Actually Does (Current Behavior)

Elliot operates as a **modular intelligence pipeline**, not a monolithic agent:

**Scout** (LLM Agent via LD AI Config)
- Interprets natural language queries about accounts
- Calls Wisdom tools to gather Gong calls, support tickets, Slack mentions, feedback themes
- Produces a narrative response for the user

**Curator** (Deterministic Code)
- Transforms raw Scout tool results into a structured `SignalBundle`
- Infers `OpportunitySnapshot` fields from Salesforce-linked Gong data
- Infers boolean flags from call title patterns and feedback themes
- No LLM involved — same inputs always produce the same output

**Judge** (Separate LLM via LD AI Config)
- Receives the curated packet as `input_text`
- Produces structured JSON: action (CREATE/UPDATE/NO_ACTION), EIC object, human summary
- Uses constrained tag taxonomy and engagement velocity interpretation
- Evaluable independently via saved packet replay

**Testing Infrastructure**
- `npm run agent:cli` — full pipeline, interactive or one-shot
- `npm run judge:test` — replay saved Curator packets through any Judge AI Config
- `npm run eval:ld:gold` — regression suite against gold test cases

## 4. AI Teammate Lifecycle (Process)

This project follows a structured lifecycle for onboarding and operating AI teammates:

**Discovery** (Should we hire an agent?)
1. Opportunity Identification
2. Role Definition
3. Requirements Definition (functional and technical)

**Design & Hiring** (Build and evaluate candidates)
4. Architecture Design
5. Candidate Qualification
6. Interview Process (structured evaluation using datasets and scenarios)
7. Hiring Decision

**Employment** (Run the agent like a teammate)
8. Onboarding
9. Employment Monitoring (reliability, cost, performance)
10. Performance Review (iterate or replace as needed)

This lifecycle is intended to be repeatable across future AI agents, not just Elliot.

## 5. Key Artifacts

### Process & Framework
- AI Teammate Lifecycle
- Agent Interview Framework (scorecards and evaluation stages)
- Role Requirements and Candidate Qualification definitions

### Data and Evaluation
- Gold test dataset: `data/elliot.gold.v0.1.jsonl` (10 cases)
- Adversarial test cases: `fixtures/curator-packets/adversarial/`
- Curator packet fixtures: `fixtures/curator-packets/gold/`
- Saved real-world packets: `packets/` (from live Wisdom data)
- Evaluation harness and scripts: `npm run eval:*`, `npm run judge:test`

### Implementation
- Scout prompts: `docs/prompts/elliot-scout.md`
- Judge prompts: `docs/prompts/elliot-judge.md`
- Pipeline architecture: `docs/architecture/elliot/pipeline.md`
- Wisdom integration: `docs/architecture/elliot/wisdom-integration.md`
- GitHub repo: [s-shindeldecker/elliot-eval](https://github.com/s-shindeldecker/elliot-eval)

### Build Log
- Full build log and narrative: [Hiring an Agent Teammate: Build log — Elliot](link-to-build-log)

## 6. Key Decisions So Far

| Decision | Rationale | Status |
|----------|-----------|--------|
| Use a Decision Contract as the primary interface between humans and Elliot | Keeps work structured, scorable, and repeatable | Locked-in |
| Start with a Curator-first pattern instead of fully autonomous browsing | Reduces risk and improves debuggability | Active |
| Treat this as an evaluation-first project | Ensures changes are measurable and meaningful | Active |
| Use a modular pipeline (Scout → Curator → Judge → Scribe) | Separates responsibilities and improves evaluation clarity | Active |
| Treat agent development as a lifecycle, not a one-time build | Enables repeatable onboarding and continuous improvement | Active |
| Use Enterpret/Wisdom MCP as primary data source instead of separate API integrations | Provides unified access to Gong, Zendesk, Slack, and feedback themes through a single Cypher query interface | Active |
| Keep Scout, Curator, and Judge as distinct stages (not combined into one LLM) | Enables independent evaluation and prevents LLM drift in deterministic components | Active |
| Slack-based interface (Slack bot triggers AI Config Agent) | Mirrors real teammate interaction patterns; deferred until pipeline is stable | Planned |
| Defer proactive/periodic monitoring to a later phase | Focus on call-and-response first; proactive mode adds complexity | Parked |
| Constrain Judge influence tags to a closed enum | Enables deterministic evaluation; prevents tag vocabulary drift | Active |

## 7. Risks and Open Questions

### Current Risks

- **Slack data coverage**: Only 21 of many Slack channels are indexed in Enterpret. Key account discussions may be missed. Pursuing expansion with the Enterpret team.
- **Salesforce API not yet connected**: Curator infers fields from Gong's Salesforce-linked data, but direct Salesforce access would provide opportunity_link, next_checkpoint, expected_revenue, probability, and motion. Currently blocked on API credentials.
- **Gold dataset calibration**: Test expectations were authored against an earlier Judge prompt. Need to evolve gold cases to reflect current prompt behavior and real-world Curator packet structure.
- **Scout not calling get_call_details**: Scout consistently gathers summary data but rarely drills into full call transcripts, leaving evidence snippets thin for the Judge.
- **Judge numeric calibration**: influence_strength and impact_priority tend to run ~1 point high with the current prompt. Needs either prompt tuning or gold dataset adjustment.

### Open Questions

- How should evaluation metrics map to business impact (time saved, decision quality, coordination cost)?
- What are the minimum behaviors that make Elliot feel like a real teammate?
- Should the gold dataset evolve to include real-world Curator packets alongside synthetic ones?
- How should we handle accounts with multiple Salesforce opportunities (e.g., trial + active deal)?

## 8. Near-Term Focus

1. **Fix remaining gold eval failures**: `eic_id` schema issue, numeric range calibration, tag vocabulary gaps
2. **Add real-world packets to gold dataset**: Use saved Curator packets from live Wisdom queries as test cases
3. **Connect Salesforce API**: Fill in the fields the Curator can't infer (opportunity_link, next_checkpoint, revenue, probability, motion)
4. **Expand Slack coverage**: Work with Enterpret team to index more channels (especially `ext-*` customer channels)
5. **Wire up Slack bot**: Enable real user interaction via Slack messages
6. **Strengthen Scout**: Prompt improvements to call `get_call_details` on key calls, improving evidence quality

## 9. How This Page Stays Updated

This page is intended to remain concise and current. The full build log contains detailed history and reasoning.

When making significant updates:
- Refresh the Current State section
- Update Risks and Near-Term Focus as priorities shift
- Capture any durable decisions in the Key Decisions table

For full context, refer to: [Hiring an Agent Teammate: Build log — Elliot](link-to-build-log)
