---
stage: nfr-design
number: "3.3"
phase: construction
condition: "only after applicable NFR requirements"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 3.3 nfr design

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
reason. Only 1.7 waits for approval. At 3.6, invoke
`aidlc.ts complete <intent-path>` with no evidence; it runs exactly the one
configured final gate and returns the result.

MANDATORY: Follow stage-protocol.md for the universal question contract and completion evidence.

## Steps

### Execution Modes

This stage supports two execution modes, controlled by the orchestrator:

**QUESTION-ONLY mode** (invoked by orchestrator during a implementation increments's question phase):
Execute Steps 1–4 only (load personas, read artifacts, generate questions, collect answers).
Do NOT proceed to design or artifact generation. Return control to the orchestrator.

**ARTIFACT-ONLY mode** (invoked by orchestrator during a implementation increments's design phase):
Skip Steps 1–4 (questions already collected and approved).
Read the answered questions file from the per-unit directory.
Execute Steps 5–8 only (design solutions, generate artifacts, update state, completion).

**Full mode** (default — single-unit projects or direct stage invocation):
Execute all steps sequentially as written.

### Step 1: Load Personas

Apply the architect role (lead) perspective from the stage packet and its
knowledge paths. Add a platform or compliance perspective only when the
approved NFR needs it; otherwise do not create a synthetic dependency.

### Step 2: Read Prior Artifacts

Read NFR requirements from the relevant central intent section. Read functional design artifacts from the relevant central intent section (if they exist). Read application design from the relevant central intent section (if exists) for architectural context; when the scope skipped those design stages, derive the architectural context from the NFR requirements and, on brownfield, the codebase-memory evidence — never invent the content of a missing artifact.

### Step 3: Generate Design Questions

Create a questions file at the relevant central intent section with context-appropriate questions using [Answer]: tags.

Focus areas:
- Resilience patterns (circuit breakers, bulkheads, fallback strategies)
- Scalability patterns (horizontal vs vertical, data partitioning, caching tiers)
- Performance optimization (latency budgets, throughput targets, resource pooling)
- Security approach (defense in depth, zero trust, encryption standards)
- Logical component boundaries (service isolation, failure domains, blast radius)

### Step 4: Collect and Analyze Answers

Collect answers following stage-protocol.md §3 question flow (offer interaction mode choice, collect answers, write back to file). After collecting answers, perform MANDATORY ambiguity analysis:
- Identify vague answers ("mix of", "not sure", "depends", "probably")
- Check for contradictions between answers
- Flag missing details needed for artifact generation

If ANY ambiguity found: create follow-up questions and resolve before proceeding.

### Step 5: Design NFR Solutions

Design concrete solutions for each NFR category:

- **Performance**: Caching strategies, query optimization, connection pooling, async processing, CDN usage, lazy loading, pagination
- **Security**: Authentication flows, authorization model, encryption (at rest and in transit), input validation, CSRF/XSS protection, secrets management, audit logging
- **Scalability**: Horizontal/vertical scaling approach, load balancing, data partitioning/sharding, queue-based decoupling, stateless design
- **Reliability**: Circuit breakers, retry policies with backoff, health checks, graceful degradation, failover strategies, data replication

### Step 6: Generate Artifacts

Generate the following in the relevant central intent section:

- **performance-design.md**: Caching architecture, optimization strategies, resource pooling, async patterns, performance budgets
- **security-design.md**: Authentication/authorization architecture, encryption design, input validation strategy, security headers, compliance controls
- **scalability-design.md**: Scaling architecture, load distribution, data partitioning strategy, capacity thresholds, auto-scaling rules
- **reliability-design.md**: Resilience patterns, circuit breaker configuration, retry policies, health check design, failover procedures, backup strategy
- **logical-components.md**: Logical infrastructure component inventory — service boundaries, failure domains, blast radius mapping, component isolation strategy, shared resource identification. Bridges NFR design decisions with applicable implementation design by providing a component-level view of where NFR patterns apply.

### Step 7: Completion Handoff

Record completion through `bun ~/.agents/scripts/aidlc.ts complete <intent-path> "<evidence>"`.
`bun ~/.agents/scripts/aidlc.ts complete <intent-path> "<evidence>"`.
The Use the universal lifecycle script to record the stage outcome.

### Step 8: Completion

Record completion evidence and continue:

```
# :shield: NFR Design Complete — {unit-name}
```

Summary of design decisions per NFR category, then:

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
