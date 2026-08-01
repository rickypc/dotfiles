---
stage: nfr-requirements
number: "3.2"
phase: construction
condition: "when NFRs need explicit requirements"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 3.2 nfr requirements

## Universal runtime contract

This is the retained upstream stage method adapted to the universal runtime.
The route, applicability, roles, sensors, and current state come only from the
stage packet emitted by `~/.agents/scripts/aidlc.ts`; this document cannot add
prerequisite stages or a separate lifecycle. Work in the selected project and
record evidence, decisions, and project-document links in the central temporary
intent at `~/.agents/aidlc/<cbm-index>/intents/<intent-id>.md`.

Use the role cards as review perspectives in the current assistant. Do not
expect assistant-native orchestration or lifecycle storage. For repository
facts, invoke `codebase-memory`; for persistent knowledge, invoke
`knowledge-base`. At completion, run the packet's sensors
and use `aidlc.ts complete <intent-path> <evidence>` or `skip` with a factual
reason. Only 1.7 waits for approval. Build and Test owns the final-gate route;
follow its returned stage packet and the stage protocol when it becomes active.

MANDATORY: Follow stage-protocol.md for the universal question contract and completion evidence.

## Steps

### Execution Modes

This stage supports two execution modes, controlled by the orchestrator:

**QUESTION-ONLY mode** (invoked by orchestrator during a implementation increments's question phase):
Execute Steps 1–5 only (load personas, read artifacts, assess categories, generate questions, collect answers).
Do NOT proceed to artifact generation. Return control to the orchestrator.

**ARTIFACT-ONLY mode** (invoked by orchestrator during a implementation increments's design phase):
Skip Steps 1–5 (questions already collected and approved).
Read the answered questions file from the per-unit directory.
Execute Steps 6–8 only (generate artifacts, update state, completion).

**Full mode** (default — single-unit projects or direct stage invocation):
Execute all steps sequentially as written.

### Step 1: Load Personas

Apply the architect role (lead), security, and quality perspectives from the
stage packet and their knowledge paths. Add a platform or compliance
perspective only when the approved requirements make it material.

### Step 2: Read Prior Artifacts

Read applicable functional-design and requirements evidence from the central
intent. For brownfield work, use verified codebase-memory findings. If
Functional Design was conditionally skipped, derive NFR context from those
sources without inventing a missing artifact.

### Step 3: Assess NFR Categories

Analyze the unit across NFR categories:
- **Performance**: Response times, throughput, latency targets, resource utilization
- **Security**: Authentication, authorization, data protection, compliance requirements
- **Scalability**: Load handling, growth projections, scaling strategies
- **Reliability**: Availability targets, fault tolerance, disaster recovery, data durability
- **Observability**: Monitoring, logging, alerting, tracing requirements

### Step 4: Generate Questions

Create a questions file at the relevant central intent section for unclear NFR areas using [Answer]: tags. Focus on quantifiable targets and specific constraints.

### Step 5: Collect and Analyze Answers

Collect answers following stage-protocol.md §3 question flow (offer interaction mode choice, collect answers, write back to file). Perform MANDATORY ambiguity analysis:
- Identify vague answers ("fast enough", "highly available", "secure")
- Check for contradictions between NFR targets
- Flag missing quantitative targets

If ANY ambiguity found: create follow-up questions and resolve before proceeding.

### Step 6: Generate Artifacts

Generate the following in the relevant central intent section:

- **performance-requirements.md**: Response time targets, throughput requirements, latency budgets, resource constraints, benchmarks
- **security-requirements.md**: Authentication requirements, authorization model, data protection, compliance, threat considerations
- **scalability-requirements.md**: Load projections, scaling triggers, capacity planning, data growth, concurrency targets
- **reliability-requirements.md**: Availability targets (SLA/SLO), fault tolerance requirements, backup/recovery, graceful degradation
- **tech-stack-decisions.md**: Technology selections and rationale — languages, frameworks, databases, infrastructure tools, and justification for each choice

### Step 7: Completion Handoff

Record completion through `bun <agents-root>/scripts/aidlc.ts complete <intent-path> "<factual-evidence>"`.
The Use the universal lifecycle script to record the stage outcome.

### Step 8: Completion

Record completion evidence and continue:

```
# :bar_chart: NFR Requirements Complete — {unit-name}
```

Summary of NFR categories addressed and key targets, then:

```
**Review:** the relevant central intent section
```

No additional approval gate applies; record evidence and continue.

## Evidence, validation, and learning

Record this stage's substantive outputs in the central intent: the decision,
evidence sources, assumptions, unresolved risks, and links to any
project-owned documents or implementation files. The packet's named sensor
contracts—not an upstream sensor manifest—define the validation required here.
Repair a failed sensor or re-plan with the failure evidence before completion.

Use `knowledge-base` only after 3.6 to capture a genuinely reusable lesson;
do not create a local memory tree, a placeholder KB record, or a new runtime
asset. This stage is complete only when its evidence is sufficient for the next
selected stage or a factual skip has been recorded.
