# Approval-gate sensor contract

## Applies to

Approval & Handoff (1.7) only. The executable check is
`utils/aidlc/sensors.ts`; it accepts a stage explicitly awaiting approval or a
persisted `approval: approved` decision.

## Pass condition

The central intent contains a decision-ready handoff and is either held for an
explicit human decision or already approved through `aidlc.ts approve`. The
only valid decisions are Approve, Re-plan, and Decline.

## Required behavior

Present the scope, acceptance criteria, material constraints, unresolved risk,
and one final gate before asking. Do not infer approval from a prior
conversation, a vague instruction to continue, an implementation request, or
the absence of objections. Re-plan records the correction and returns to the
smallest owning stage; Decline does not enter Construction.

## On failure

Keep the route at 1.7. Repair the handoff or obtain the explicit decision;
never use a later stage, a comment, or manual frontmatter editing to bypass it.
