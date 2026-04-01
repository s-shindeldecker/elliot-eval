# Elliot – Project Brief

> Source of truth for details: [Full build log](link-to-build-log)

## 1. Purpose

LaunchDarkly has consistently struggled to maintain reliable visibility into the business impact of Experimentation, especially through the lens of deals and account motion. Historically, sales attribution has been inconsistent. Upcoming pricing changes will further reduce visibility by removing a distinct ARR line item for experimentation.

If we cannot continuously demonstrate how experimentation contributes to revenue motion, expansion, strategic positioning, and AI-related adoption, we risk losing prioritization and internal support—not due to lack of customer value, but due to lack of visibility.

This project addresses that need by building Elliot, an AI teammate focused on detecting and validating experimentation impact signals.

More broadly, this effort is exploring a repeatable process for onboarding AI teammates into real workflows—including how to define their role, evaluate their performance, and operate them reliably over time.

## 2. Current State (Snapshot)

**Last updated: Mar 31, 2026**

Elliot has a **fully working end-to-end pipeline** from interactive CLI through live data to scored intelligence output, with 100% gold eval pass rate:

```
User Query → Scout (LLM Agent) → Wisdom Tools → Curator (Deterministic) → Judge (LLM Scorer) → Scored EIC
```

### What's Working

- **Scout** operates as an LLM agent (via `elliot-agent` LD AI Config, `gpt-4o`) with 6 Wisdom tools querying the Enterpret Knowledge Graph for Gong calls, Zendesk tickets, Slack mentions, feedback themes, and enriched account data (ARR, industry, owner, lifecycle stage)
- **Multi-turn conversations** with disambiguation — when `search_account` returns multiple different account names, Scout asks for clarification before proceeding; conversation history maintained across turns in the CLI
- **Curator** deterministically transforms raw tool results into a structured `SignalBundle`, including:
  - Opportunity metadata inferred from Gong Salesforce-linked fields (name, stage, amount)
  - Enriched account data (type, ARR, industry, owner, lifecycle stage) from `search_account`
  - Feedback trajectory computation (recency-weighted complaint/praise analysis detecting improving, declining, or stable trends)
  - Evidence items with source IDs (no fabricated URLs), Slack channel/author context
- **Judge** (`elliot-candidate-a` AI Config, `gpt-4o-mini`) scores curated packets with constrained influence tag taxonomy, recency and trajectory interpretation, and engagement velocity calibration
- **CLI harness** (`npm run agent:cli`) for interactive multi-turn testing — auto-saves Curator packets for replay
- **Judge replay harness** (`npm run judge:test`) for A/B testing prompt variations against saved packets
- **Evaluation harness** with 10 gold test cases using set-based matching for ambiguous fields
- **LD MCP integration** — prompts can be synced to AI Configs programmatically via `update-ai-config-variation`

### Data Sources (via Enterpret/Wisdom MCP)

| Source | Records | What Elliot Sees |
|--------|---------|-----------------|
| Gong | ~12,500 | Call transcripts, participants, Salesforce opportunity linkage (name, stage, amount) |
| Zendesk | ~15,500 | Support tickets, status |
| Slack | ~2,000 | Internal messages from 21 indexed channels (with channel name and author) |
| Feedback themes | Aggregated | NLP-derived themes with timeline data across all sources (complaints, praise, improvements, help requests) |
| Account data | Enriched | Account type, ARR, industry, owner, lifecycle stage, Salesforce ID |

### Latest Eval Results (Mar 31, 2026)

Gold eval (10 cases): **10/10 passing (100%)**
- All action decisions correct (CREATE, UPDATE, NO_ACTION)
- Set-based matching for ambiguous influence tags (`expansion_catalyst` vs `strategic_positioning`)
- Zero hard failures (no hallucinations, schema errors, parse failures)
- Average latency: ~6s per case

## 3. What Elliot Actually Does (Current Behavior)

Elliot operates as a **modular intelligence pipeline**, not a monolithic agent. Orchestration happens in TypeScript code (`ElliotAgent`), not inside any LLM.

**Scout** (LLM Agent via LD AI Config)
- Interprets natural language queries about accounts
- Calls Wisdom tools to gather Gong calls, support tickets, Slack mentions, feedback themes, and enriched account data
- Handles multi-turn disambiguation when multiple accounts match
- Drills into key call transcripts for evidence quality
- Produces a narrative response for the user

**Curator** (Deterministic Code)
- Transforms raw Scout tool results into a structured `SignalBundle`
- Infers `OpportunitySnapshot` fields from Salesforce-linked Gong data and enriched account metadata
- Computes feedback trajectory (early vs recent complaint/praise trends)
- Includes Slack channel/author context in evidence snippets
- Renders a deterministic text packet for the Judge
- No LLM involved — same inputs always produce the same output

**Judge** (Separate LLM via LD AI Config)
- Receives the curated packet as `input_text`
- Produces structured JSON: action (CREATE/UPDATE/NO_ACTION), EIC object, human summary
- Uses constrained tag taxonomy, recency/trajectory interpretation, and confidence mapping
- Evaluable independently via saved packet replay

**Testing Infrastructure**
- `npm run agent:cli` — full pipeline, interactive or one-shot, with multi-turn context
- `npm run judge:test` — replay saved Curator packets through any Judge AI Config
- `npm run eval:ld:gold` — regression suite against gold test cases (10/10 passing)

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
- Gold test dataset: `data/elliot.gold.v0.1.jsonl` (10 cases, 100% pass rate)
- Adversarial test cases: `fixtures/curator-packets/adversarial/`
- Curator packet fixtures: `fixtures/curator-packets/gold/`
- Saved real-world packets: `packets/` (from live Wisdom data)
- Evaluation harness and scripts: `npm run eval:*`, `npm run judge:test`

### Implementation
- Scout prompts: `docs/prompts/elliot-scout.md`
- Judge prompts: `docs/prompts/elliot-judge.md`
- Pipeline architecture: `docs/architecture/elliot/pipeline.md`
- Wisdom integration: `docs/architecture/elliot/wisdom-integration.md`
- System architecture diagram: `docs/architecture/elliot-system-diagram.html`

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
| Use Enterpret/Wisdom MCP as primary data source | Provides unified access to Gong, Zendesk, Slack, and feedback themes through a single Cypher query interface | Active |
| Keep Scout, Curator, and Judge as distinct stages (not combined into one LLM) | Enables independent evaluation and prevents LLM drift in deterministic components | Active |
| Constrain Judge influence tags to a closed enum | Enables deterministic evaluation; prevents tag vocabulary drift | Active |
| Use set-based matching for ambiguous gold eval fields | Accommodates legitimate LLM variance without weakening eval rigor | Active |
| Orchestrate pipeline in code, not in the LLM | Ensures deterministic stage boundaries and prevents LLM from skipping stages | Active |
| Curator uses real source IDs, not fabricated URLs | Prevents hallucination-checker false positives; honest about available data | Active |
| Enriched account data flows through Curator to Judge | Gives Judge context on ARR, industry, lifecycle stage without requiring Salesforce API | Active |
| Feedback trajectory computed deterministically in Curator | Temporal complaint/praise patterns inform Judge without requiring LLM to do time-series analysis | Active |
| Slack-based interface deferred until pipeline is stable | Mirrors real teammate interaction patterns; focus on pipeline quality first | Planned |
| Defer proactive/periodic monitoring to a later phase | Focus on call-and-response first; proactive mode adds complexity | Parked |

## 7. Risks and Open Questions

### Current Risks

- **Slack data coverage**: Only 21 of many Slack channels are indexed in Enterpret. Key account discussions may be missed. Pursuing expansion with the Enterpret team.
- **Salesforce API not yet connected**: Curator infers fields from Gong's Salesforce-linked data and enriched account metadata, but direct Salesforce access would provide opportunity_link, next_checkpoint, expected_revenue, probability, and motion. Currently blocked on API credentials.
- **Curator expansion**: Each new data source requires a new extractor function in the Curator. As tools are added, the Curator must be updated to consume their results — it won't automatically pick up new tool outputs.
- **LLM variance on ambiguous cases**: Some gold cases require set-based matching because the Judge legitimately picks different tags across runs. This is managed but not eliminated.

### Open Questions

- How should evaluation metrics map to business impact (time saved, decision quality, coordination cost)?
- What are the minimum behaviors that make Elliot feel like a real teammate?
- Should the gold dataset evolve to include real-world Curator packets alongside synthetic ones?
- How should we handle accounts with multiple Salesforce opportunities (e.g., trial + active deal)?

## 8. Near-Term Focus

1. **Connect Salesforce API**: Fill in the fields the Curator can't infer (opportunity_link, next_checkpoint, revenue, probability, motion)
2. **Add real-world packets to gold dataset**: Use saved Curator packets from live Wisdom queries as test cases
3. **Expand Slack coverage**: Work with Enterpret team to index more channels (especially `ext-*` customer channels)
4. **Wire up Slack bot as primary interface**: Enable real user interaction via Slack messages
5. **Build Scribe for persistence**: Google Sheet mapping, idempotent updates, dashboard output
6. **Begin shadow-mode operation**: Run against real accounts and compare with human assessments

## 9. How This Page Stays Updated

This page is intended to remain concise and current. The full build log contains detailed history and reasoning.

When making significant updates:
- Refresh the Current State section
- Update Risks and Near-Term Focus as priorities shift
- Capture any durable decisions in the Key Decisions table

For full context, refer to: [Hiring an Agent Teammate: Build log — Elliot](link-to-build-log)
