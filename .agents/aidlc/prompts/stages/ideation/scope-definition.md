---
stage: scope-definition
number: "1.4"
phase: ideation
condition: "always"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 1.4 scope definition

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

### Step 1: Load Agent Personas

Apply the product role perspective from the stage packet and its knowledge paths.

### Step 2: Load Prior Context

- Read intent statement from the relevant central intent section
- Read feasibility assessment from the relevant central intent section (if exists)
- Read constraint register and RAID log (if exist)

### Step 3: Generate Clarifying Questions

Create the relevant central intent section with questions:
- What is the minimum viable scope that delivers value?
- What capabilities are must-have vs. nice-to-have?
- What are the dependencies between capabilities?
- What is the sequencing preference (risk-first, value-first, dependency-first)?
- Are there hard deadlines tied to specific capabilities?

Follow stage-protocol.md question flow.

### Step 4: Collect and Analyze Answers

Run ambiguity detection, contradiction analysis, and scope-vs-timeline validation.

### Step 5: Generate Artifacts

Create scope definition document (in/out boundary), prioritized intent backlog (proto-Units using MoSCoW/WSJF/RICE), and value stream map.

### Step 6: Completion Handoff

Record completion through `bun ~/.agents/scripts/aidlc.ts complete <intent-path> "<evidence>"`.
`bun ~/.agents/scripts/aidlc.ts complete <intent-path> "<evidence>"`.
The Use the universal lifecycle script to record the stage outcome.

### Completion handoff

Completion emoji: :dart:
Review path: the relevant central intent section
No additional approval gate applies; report the evidence and continue.

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
