# elliot-eval

**Elliot Evaluation Harness** — Experimentation Line-of-sight & Impact Observation Tracker

## Purpose

Elliot’s mission is to:

**Maintain a continuously updated, evidence-grounded intelligence system that detects, validates, and communicates how experimentation influences revenue motion, expansion, competitive positioning, and AI adoption at LaunchDarkly—especially in environments where ARR attribution is no longer directly observable.**

The system exists to convert fragmented signals into **defensible, structured impact intelligence**.

This repository does **not** implement the full production system.  
It contains the **evaluation harness and supporting module scaffolding** used to:

- test candidate agents
- enforce strict output contracts
- measure decision quality
- support an “agent hiring” workflow

---

## Pipeline Overview

Elliot is designed as a multi-stage system:

Scout → Curator → Judge → Scribe

| Stage | Role | Status |
|------|------|--------|
| **Scout** | Gather raw evidence from systems (Salesforce, Gong, etc.) and produce `SignalBundle` | v0 implemented; Salesforce-shaped v1 skeleton |
| **Curator** | Validate and normalize signals into deterministic input packets | Implemented (validation + rendering; scoring partial) |
| **Judge** | Classify impact and produce structured JSON output | Implemented via evaluation harness (LD AI Config candidates) |
| **Scribe** | Persist decisions and manage EIC lifecycle | In-memory prototype only; not integrated |

### Important
- The **evaluation harness is complete and deterministic**
- The **agent pipeline is partially implemented**
- Judge quality is currently the most mature component

---

## Determinism & Auditability

The following are deterministic and auditable:

- schema validation (AJV)
- normalization layer
- scoring logic
- failure classification
- reporting outputs

Model responses (LD/OpenAI) are **not deterministic**, but are evaluated under deterministic rules.

---

## Architecture Docs

- [Elliot documentation index](docs/architecture/elliot/README.md)
- [Pipeline overview](docs/architecture/elliot/pipeline.md)
- [Decision Contract (v2)](docs/architecture/elliot/decision-contract.md)
- [Enums](docs/architecture/elliot/enums.md)
- [Credibility standards](docs/architecture/elliot/credibility-standards.md)
- [ADR-0001: Scribe separation](docs/decisions/ADR-0001-scribe-separation.md)

---

## Quick Start

```bash
npm install

npm run test:screening
npm run test:contract-v2
npm run eval:sample