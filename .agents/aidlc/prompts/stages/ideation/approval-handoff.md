---
stage: approval-handoff
number: "1.7"
phase: ideation
condition: "always; explicit approval"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 1.7 Approval and Handoff

This is the sole human plan-approval gate. It compiles the completed Ideation
evidence into one decision-ready handoff; it does not introduce new research,
design artifacts, staffing assumptions, or a second scope.

## Required handoff

Read Intent Capture, any material Feasibility findings, and Scope Definition.
Record a concise plan in the central intent's **Plan** section containing:

- requested outcome and user value;
- in-scope behavior, explicit exclusions, and acceptance criteria;
- verified current-state facts and material assumptions;
- constraints, risks, dependencies, and unresolved decisions;
- UI applicability; and
- the single final project gate already resolved by Initialization.

State which selected Inception and Construction stages are expected to be
applicable and why. This is planning guidance, not a permission to omit a
stage later without factual evidence.

## Decision options

Present exactly these choices:

- **Approve** — after the user explicitly approves, persist the handoff and
  approval together through
  `aidlc.ts approve <intent-path> "<handoff evidence; user explicitly approved>"`
  and enter the selected Inception route. Do not call `complete` first.
- **Re-plan** — record the requested correction through `aidlc.ts replan`,
  return to the smallest stage that owns the change, and issue a revised
  handoff.
- **Decline** — do not enter Construction. Retire or supersede the temporary
  intent with the decision evidence.

Approval is not inferred from silence, a request to continue, or a partial
answer. It applies to the current scope and evidence only. A material change
later in the route must be re-planned against its impact; it does not turn
every stage into another approval gate.

## Validation

Run the approval-gate and intent-evidence sensors from the packet. Confirm the
plan is internally consistent, cites evidence rather than invented project
facts, and identifies the one final command. Do not proceed until a recorded
Approve decision exists.
