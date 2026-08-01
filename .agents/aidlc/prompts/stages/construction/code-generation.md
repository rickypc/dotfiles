---
stage: code-generation
number: "3.5"
phase: construction
condition: "only after approved plan"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 3.5 code generation

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

Implement only the scope approved at 1.7 and the design decisions captured by
the selected Inception and Construction stages. This is not a second approval
gate: if the approved plan is materially insufficient, re-plan with evidence
instead of silently expanding the work.

## Preparation

1. Re-read the current intent's requirements, acceptance criteria, application
   design, unit dependencies, relevant functional design, and applicable NFR
   design. Absence of a conditional artifact is not permission to invent it.
2. For brownfield work, use `codebase-memory` to verify the affected symbols,
   call paths, tests, conventions, and extension points before editing.
3. Record an ordered implementation checklist in the intent's **Plan** section.
   Each item must map to a requirement or acceptance criterion and state its
   test obligation. Include schema or migration work, contracts, configuration,
   documentation, and UI accessibility only when they are actually in scope.

## Implementation rules

- Apply the canonical **Code changes** policy in `~/.agents/AGENTS.md`. It
  governs minimum-scope implementation, reuse of existing code, removal of
  dead artifacts created by this change, and the user decision required before
  cleaning unrelated pre-existing dead code.
- Modify the selected project in place; do not create duplicate replacement
  classes or write application code under the global AIDLC directory.
- Preserve established repository conventions unless the approved architecture
  deliberately changes them.
- Add or update focused tests as part of each behavior change. Build and Test
  verifies the final result; it is not where missing implementation tests are
  deferred.
- Keep commits, branches, and assistant-specific execution choices outside this
  universal contract; a project adapter may supply those details.
- Stop and re-plan when the implementation contradicts approved requirements,
  architecture, or evidence. Do not use a code change to settle an unresolved
  product decision.

## Completion evidence

Record modified files, requirement-to-change traceability, tests added or
changed, decisions made during implementation, and known limitations in the
intent's **Execution evidence** section. Run the packet's intent-evidence
sensor before recording completion. The next stage is Build and Test, which
runs the one configured project final gate.
