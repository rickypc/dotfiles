# Construction-plan template

Delivery Planning populates this section in the central temporary intent before
Construction. Code Generation follows it in order and records actual work;
Build and Test reconciles it before the configured final gate. It is a software
engineering work record, not a second router, approval gate, or external task
tracker.

## Completion rules

- One row represents one independently reviewable construction increment.
- `Requirements and units` names the approved requirement IDs and implementation
  units; it must not introduce new scope.
- `What`, `Where`, and `Why` are all specific enough for a later stage to act
  without guessing. `Where` names a path, symbol, boundary, or a narrow
  discovery boundary when the exact target is not yet known.
- `Focused proof` names a test, smoke check, inspection, or observable result;
  the configured final gate is recorded separately as final validation.
- `Review and re-plan trigger` records a concrete review criterion and the fact
  that would require returning to the owning requirement or design decision.
- Valid status values are `pending`, `in_progress`, `complete`, `blocked`, and
  `skipped`. `skipped` requires a factual reason in `Actual evidence`.
- `Actual evidence` records changed locations, result, limitation, deviation,
  or factual skip. Never overwrite the planned rationale to hide a change.

## Construction plan

| Step | Status | Requirements and units | What | Where | Why | Depends on | Focused proof | Review and re-plan trigger | Actual evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `<ordered-step>` | `pending` | `<approved requirement IDs and units>` | `<change or verification outcome>` | `<path, symbol, boundary, or narrow discovery boundary>` | `<dependency, risk, value, or compatibility rationale>` | `<completed step or none>` | `<named proof and expected result>` | `<review criterion; factual re-plan condition>` | `Pending.` |

## Validation reconciliation

| Requirement or claim | Construction-plan step | Focused evidence | Final-gate relation | Result or limitation |
| --- | --- | --- | --- | --- |
| `<requirement or claim>` | `<step>` | `<named proof>` | `<covered by or separate from configured final gate>` | `<pass, fail, blocked, or limitation>` |
