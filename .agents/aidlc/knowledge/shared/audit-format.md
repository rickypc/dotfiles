# Universal AIDLC audit format

The temporary intent's **Audit trail** is append-only context for a lifecycle
event. The typed gray-matter frontmatter and route are authoritative state;
audit text must never alter them.

## Allowed event types

- `stage-completed`: evidence satisfied a non-gated stage.
- `stage-skipped`: a conditional stage had a factual non-applicability reason.
- `approval-granted`: the user explicitly approved the approval-handoff gate.
- `intent-replanned`: evidence or a user decision changes the current plan.
- `intent-superseded`: a replacement intent was explicitly chosen.
- `context-resolved`: validated knowledge-base bindings were resolved.

## Entry format

~~~text
- 2026-08-01T00:00:00.000Z | stage-completed | requirements-analysis | Evidence: requirements R1-R4 trace to the approved intent and code context.
~~~

Each entry needs an ISO timestamp, one allowed event type, the current stage,
and a concrete detail. Do not record secrets, private KB content, tool
transcripts, invented events, session markers, subagent IDs, worktrees, or
assistant-native hook data.

## Audit rules

- The lifecycle script appends the event after it has persisted valid state.
- Evidence belongs in the stage ledger; the audit is a concise chronological
  pointer to that evidence.
- A re-plan is not a state bypass. Complete/skip/approve still enforce the
  route.
- Final completion requires the Build and Test receipt, then knowledge-base
  closeout and retirement; there is no synthetic workflow-completed audit event.
