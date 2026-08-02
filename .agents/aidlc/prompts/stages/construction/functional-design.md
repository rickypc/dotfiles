---
stage: functional-design
number: "3.1"
phase: construction
condition: "when business logic or data design needs it"
route_authority: "<agents-root>/utils/aidlc/stages.ts"
---

# 3.1 functional design

## Universal runtime contract

This is the retained upstream stage method adapted to the universal runtime.
The route, applicability, roles, sensors, and current state come only from the
stage packet emitted by `<agents-root>/scripts/aidlc.ts`; this document cannot add
prerequisite stages or a separate lifecycle. Work in the selected project and
record evidence, decisions, and project-document links in the central temporary
intent at `<agents-root>/aidlc/<cbm-index>/intents/<intent-id>.md`.

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
Execute Steps 1–4 only (load personas, read context, generate questions, collect answers).
Do NOT proceed to artifact generation. Return control to the orchestrator.

**ARTIFACT-ONLY mode** (invoked by orchestrator during a implementation increments's design phase):
Skip Steps 1–4 (questions already collected and approved).
Read the answered questions file from the per-unit directory.
Execute Steps 5–7 only (generate artifacts, update state, completion).

**Full mode** (default — single-unit projects or direct stage invocation):
Execute all steps sequentially as written.

### Step 1: Load Personas

Apply the architect role (lead) perspective from the stage packet and its knowledge paths. Apply the developer role perspective from the stage packet and its knowledge paths for technical implementation input. Apply architect role as the primary perspective with developer role providing technical feasibility input.

### Step 2: Read Unit Context

Read the unit definition from the relevant central intent section and assigned stories from the relevant central intent section (if they exist). Read the relevant central intent section (if exists) and any application design artifacts from the relevant central intent section (if they exist).

When Units Generation or Application Design is not needed, work from the
approved requirements and, for brownfield work, verified codebase-memory
findings. Treat existing code structure as evidence of the current design; do
not invent a missing artifact.

### Step 3: Create Functional Design Plan

Analyze the unit's scope and create a functional design questions file at the relevant central intent section with context-appropriate questions using [Answer]: tags.

Focus areas:
- Business logic workflows and algorithms
- Domain models and entity relationships
- Business rules, constraints, and validation logic
- Data flow and transformations
- Integration points with other units or external systems
- Error handling and edge cases
- Frontend Components (component hierarchy, props/state, interaction flows, form validation)
- Business Scenarios (end-to-end user journeys, happy/unhappy paths, concurrency edge cases)

### Step 4: Collect and Analyze Answers

Collect answers following stage-protocol.md §3 question flow (offer interaction mode choice, collect answers, write back to file). After collecting answers, perform MANDATORY ambiguity analysis:
- Identify vague answers ("mix of", "not sure", "depends", "probably")
- Check for contradictions between answers
- Flag missing details needed for artifact generation

If ANY ambiguity found: create follow-up questions and resolve before proceeding.

### Step 5: Generate Artifacts

Generate the following in the relevant central intent section:

- **business-logic-model.md**: Detailed algorithms, workflows, data transformations, processing sequences, and decision trees for the unit's business logic
- **business-rules.md**: Decision rules, validation logic, constraints, policies, conditional behavior, and business invariants
- **domain-entities.md**: Entities, relationships, data structures, attributes, lifecycle states, and entity interaction patterns
- **frontend-components.md** (CONDITIONAL — only if unit includes frontend/UI): Component hierarchy, props/state design, interaction flows, form validation rules, API integration points

### Step 6: Completion Handoff

Record completion through `bun <agents-root>/scripts/aidlc.ts complete <intent-path> "<factual-evidence>"`.
The Use the universal lifecycle script to record the stage outcome.

### Step 7: Completion

Record completion evidence and continue:

```
# :clipboard: Functional Design Complete — {unit-name}
```

Summary of artifacts produced, then:

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
