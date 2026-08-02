---
stage: feasibility
number: "1.3"
phase: ideation
condition: "when material uncertainty remains"
route_authority: "<agents-root>/utils/aidlc/stages.ts"
---

# 1.3 feasibility

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

### Step 1: Load Agent Personas

Apply the architect role perspective from the stage packet and its knowledge paths.
Orchestrator will separately invoke the relevant platform or compliance perspective and the relevant platform or compliance perspective for their perspectives.

### Step 2: Load Prior Context

- Read intent statement from the relevant central intent section
- Read market research from the relevant central intent section (if exists)
- Load guardrails from
  the validated knowledge-base context and the central intent.

### Step 3: Generate Clarifying Questions

Create the relevant central intent section with questions:
- What existing systems must this integrate with?
- Are there regulatory/compliance requirements (PCI, HIPAA, SOC2, data residency)?
- What is the team's current tech stack and skill profile?
- What are the budget and timeline constraints?
- Are there organizational blockers (change freeze, competing priorities)?
- What AWS services and accounts are currently in use?

Follow stage-protocol.md question flow.

### Step 4: Collect and Analyze Answers

Run ambiguity detection and contradiction analysis.

### Step 5: Generate Artifacts

Create feasibility assessment (technical viability, risk analysis), constraint register (technical, organizational, regulatory), and RAID log (Risks, Assumptions, Issues, Dependencies).

The orchestrator will pass these artifacts to the relevant platform or compliance perspective for AWS landscape assessment and the relevant platform or compliance perspective for regulatory scanning, then synthesize all inputs.

### Step 6: Completion Handoff

Record completion through `bun <agents-root>/scripts/aidlc.ts complete <intent-path> "<factual-evidence>"`.
The Use the universal lifecycle script to record the stage outcome.

### Completion handoff

Completion emoji: :test_tube:
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
