---
stage: build-and-test
number: "3.6"
phase: construction
condition: "always; one final gate"
route_authority: "utils/aidlc/stages.ts"
---

# 3.6 Build and Test

This stage runs exactly one configured final project command. The command and
closeout forms are defined only by `utils/aidlc/command-contract.ts`.

## Objective pre-gate review (mandatory)

After focused checks and before the final gate, pin the approved intent,
changed-surface set, and acceptance-to-proof map. Review the completed work on
two independent axes; do not merge, rerank, or let a clean result on one axis
mask a finding on the other.

- **Standards:** inspect project standards and common smell heuristics such as
  duplication, mysterious names, feature envy, clumps, primitive obsession,
  repeated switches, shotgun surgery, divergent change, speculative
  generality, message chains, middle men, and refused bequests. Label these as
  heuristics and let project-enforced rules take precedence.
- **Spec:** check every approved requirement and preservation constraint for
  missing, partial, incorrect, or unrequested behavior, including scope creep.

Record a reproducible review matrix with: axis, source or criterion, exact
location, failure scenario or named clean scope, severity and rationale,
required correction or question, and verification. A clean result must still
name the files or surfaces and checks reviewed. Do not self-approve, omit an
axis, weaken the frozen matrix after seeing the outcome, or claim that a green
test receipt proves an unmapped requirement. Correct unresolved High/Critical
findings and repeat the review before handoff.

1. Reconcile the central intent's **Construction plan** before the final gate:
   every row is complete, has actual evidence, maps to a requirement and proof,
   and records any deviation or re-plan. Confirm Code Generation recorded
   changed files and mapped every acceptance item to a test, smoke check, or
   observable result. For applicable UI/web
   criteria, confirm the mapped retained project Playwright test and that the
   configured final gate executes it. A missing project-local runner or gate
   coverage leaves the criterion open; it does not authorize an implicit
   install, MCP, browser extension, or second command. Run focused checks
   before this stage and record their outputs. Every path named in a
   construction-plan location, focused-proof, or actual-evidence cell must be
   absolute and must exist at this handoff. If a source or test moved, update
   the plan and evidence and record the deviation before invoking the gate;
   stale proof paths are a hard failure, not a documentation detail.
2. Use the lifecycle final-gate action. It resolves the project configuration
   or `bun run test` default, executes it once, and emits the only valid 3.6
   receipt. Do not call a standalone gate helper or supply model-written gate
   evidence.
3. On failure, repair the reported problem and rerun the same lifecycle action.
   No cosmetic, lint, type, coverage, or test failure is waived or replaced by
   a narrower command.
4. If KB disposition is already known, use the atomic closeout action. If it is
   unknown after a bare pass, ask `/knowledge-base` and execute the one returned
   recovery action. Both paths preserve an explicit disposition before retirement.

## Finalizer / knowledge closeout

A passing gate is validation, not retirement. After the lifecycle-generated
receipt, invoke `/knowledge-base` to decide whether the work has no durable
lesson, updates an existing concept, or needs a new concept. For a known
no-lesson disposition, use the returned atomic closeout action. If capture is
required, use the returned `capture-and-begin`, edit only its returned source,
then run the exact `finalize-and-recover` action. Do not create a separate
Closure phase, manually retire the intent, or run a second gate.

Use the **Validation record** in
`aidlc/knowledge/shared/software-engineering-work-packets.md` to show which
acceptance proof came from focused evidence and which comes from the final-gate
receipt. Do not let a green gate imply an unmapped behavior was proven.

A passing final gate does not close an acceptance item without its own mapped
proof.
