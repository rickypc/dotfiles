---
stage: reverse-engineering
number: "2.1"
phase: inception
condition: "for brownfield work"
route_authority: "<agents-root>/utils/aidlc/stages.ts"
---

# 2.1 reverse engineering

## Universal runtime contract

This is the retained upstream stage method adapted to the universal runtime.
The route, applicability, roles, sensors, and current state come only from the
stage packet emitted by `<agents-root>/scripts/aidlc.ts`; this document cannot add
prerequisite stages or a separate lifecycle. Work in the selected project and
record evidence, decisions, and project-document links in the central temporary
intent at `<agents-root>/aidlc/<cbm-index>/intents/<intent-id>.md`.

Use the role cards as review perspectives in the current assistant. Do not
expect assistant-native orchestration or lifecycle storage. For repository
facts, invoke `/codebase-memory`; for persistent knowledge, invoke
`/knowledge-base`. At completion, run the packet's sensors
and use `aidlc.ts complete <intent-path> <evidence>` or `skip` with a factual
reason. Only 1.7 waits for approval. Build and Test owns the final-gate route;
follow its returned stage packet and the stage protocol when it becomes active.

Perform this stage only for an existing codebase. For greenfield work, record a
skip stating that no existing implementation exists, then continue to
Requirements Analysis. Do not invent a code map from the requested feature.

## Scope before scanning

Honor a named module, subsystem, or pain point as the initial scope. When the
request names no direction, use available project evidence to identify the
recently active or repeatedly changed areas before widening the search. Read
the applicable domain glossary and ADRs before proposing architectural change.
Record where investigation felt costly: concepts split across many modules,
interfaces nearly as complex as their implementations, extracted helpers that
hide call-site behavior, weak test surfaces, and dependencies leaking across a
seam. These are research signals, not findings by themselves.

## Research procedure

1. Use `/codebase-memory` for the project selected in the intent. Ask it for
   the architecture, relevant symbols, inbound and outbound paths, and focused
   source snippets. It owns the escalation path; do not substitute independent
   discovery or a hand-composed index directory.
2. Read the project instructions and the existing tests around the affected
   behavior. Separate observed facts from inferences and from user claims.
3. Record a concise, traceable baseline in the intent's **Research** section:
   system purpose, relevant components and owning boundaries, current request
   path or data flow, public contracts, dependencies, persistence, quality
   constraints, existing test coverage, and technical risks.
4. Use the **Research record** in
   `aidlc/knowledge/shared/software-engineering-work-packets.md` so every
   conclusion identifies its evidence and inference is not reported as fact.
   For any proposed deepening or refactor, apply a deletion test: would
   removing the suspected indirection concentrate complexity in a more useful
   module, or merely move it? Only the former is an architectural candidate.
5. For a multi-repository request, repeat the same evidence collection for each
   independently indexed project. Repositories under a common home directory
   are not one project merely because their paths share a prefix. A separately
   indexed excluded directory is valid context in its own right.

## Required evidence

The stage evidence must identify the CBM project name, the queries or graph
views used, the relevant code locations or symbols, and the conclusion each
source supports. Capture only the portion needed for this intent; a generic
repository dump is not an architectural decision record.

## Handoff

Summarize the current-state boundaries and reusable components for Requirements
Analysis. If the evidence exposes a material ambiguity, ask the smallest
question that resolves it. Otherwise record completion; this stage has no
additional approval gate.

## Evidence, validation, and learning

Run the context-snapshot and intent-evidence sensor contracts returned in the
stage packet. Repair any factual gap before completing the stage. The central
intent is temporary; do not create a local code-knowledge tree or a durable
knowledge record here.
