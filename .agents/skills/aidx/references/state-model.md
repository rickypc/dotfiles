# AIDX state model

## Goal record location

Store one Markdown record per goal at:

```text
<agents-root>/skills/aidx/sessions/<cbm-index>/goals/<goal-id>.md
```

Use the selected CBM project name as `<cbm-index>`. Do not invent an index or
use an absolute path as its name. The record is runtime session state, not a
project design document and not a knowledge-base concept. The session root is
inside the skill so AIDX has no parallel top-level state tree.

## Front matter

Use this compact front matter and preserve the fields across updates:

```yaml
---
id: <stable-goal-id>
status: CAPTURE_GOAL
project_root: <absolute-project-root>
cbm_index: <validated-cbm-index>
created_at: <iso-8601>
updated_at: <iso-8601>
plan_version: 0
current_step: 0
approval: pending
lesson_disposition: pending
---
```

The body owns the evidence and decisions:

```markdown
# Goal

<user goal>

## Initial Context

<concerns, constraints, and supplied references>

## Inspection Evidence

- <observed fact> — <absolute path or command receipt>

## Questions and Answers

This section is maintained by the LLM from the interactive conversation. The
user answers questions in chat; the LLM records each answer, consequence, and
decision here before generating a plan. Do not create a sibling answer file or
separate answer file per question unless the user explicitly requests offline
editing or file-based resume.

### Question 1

- Question: <material question>
- Answer: <user answer>
- Consequence: <plan impact>

## Decisions and Exclusions

- Decision: <chosen behavior and reason>
- Exclusion: <explicitly out of scope>

## Plan v<N>

### Acceptance

- [ ] <observable acceptance item>

### Steps

1. [ ] <step, owner boundary, and proof>

### Re-plan Triggers

- <fact that invalidates this plan>

## Approval

- Status: pending|approved|superseded
- Evidence: <explicit user approval or revision>

## Execution Evidence

- <step result, changed path, command, or deviation>

## Validation

- Acceptance: <item> → <proof>
- Focused checks: <commands and results>
- Final gate: <command and result>

## Lesson

- Disposition: no-durable-lesson|new-primary|update-existing|blocked
- Evidence: <observed lesson or reason no lesson was retained>

## Audit

- <timestamp> — <state transition> — <evidence>
```

The goal record contains exactly one active plan section until finalization. A revision replaces
the previous active plan in place and records only a compact change note in the
audit. Never append a second complete plan or use the goal record itself as an
evidence file; evidence paths must point to compact, event-specific receipts.
`current_step` counts persisted lifecycle transitions. `plan_version` counts
generated plan revisions and remains unchanged while a revision is being
requested. The plan-generation owner reads `plan_version`: it creates `v1`
only from `0`, otherwise writes the next version, and replaces the existing
plan in place. The `plan_ready` state transition is the sole metadata owner;
it accepts only the next heading and rejects stale, duplicated, or reset
versions. Compaction or repair must never reset the plan to an earlier version.

During `DISTILL_LESSON`, the active plan is mandatory while
`lesson_disposition: pending`. The LLM must review that plan and materialize
one decision object containing `planVersion` and one disposition. A positive
disposition includes the absolute receipt path returned by `/knowledge-base`;
`no-durable-lesson` includes a non-empty justification and no receipt path.
The deterministic finalizer validates the current plan version and the branch
contract, records a compact digest, removes the plan, and changes the lesson
disposition. After that mutation, `DISTILL_LESSON` and `DONE` require no active
plan, and `lesson_complete` is legal only from that finalized state.

## Legal transitions

```text
CAPTURE_GOAL
  → INSPECT_CONTEXT
INSPECT_CONTEXT
  → ASK_QUESTIONS
ASK_QUESTIONS
  → ASK_QUESTIONS     (answer received; reassess completeness)
  → GENERATE_PLAN     (all material gaps resolved or explicitly deferred)
  → awaiting user answers
GENERATE_PLAN
  → APPROVE_REVISE
APPROVE_REVISE
  → GENERATE_PLAN       (revision or material new answer)
  → EXECUTE_PLAN        (explicit approval)
EXECUTE_PLAN
  → TEST                 (approved steps complete)
  → GENERATE_PLAN       (material scope change)
TEST
  → REPAIR               (failure)
  → DISTILL_LESSON       (pass)
REPAIR
  → TEST                 (in-scope repair)
  → GENERATE_PLAN        (new scope or design)
DISTILL_LESSON
  → DONE                  (after deterministic finalizer removes the plan)
```

`blocked` and `deferred` may be recorded from any decision point when evidence
shows that the goal cannot safely proceed or is intentionally postponed. They
must include the dependency, owner, and resume condition.

## Response contract

Every AIDX response begins with the persisted state. The response then contains
only the work appropriate for that state and a clear next event:

```text
**[AIDX: ASK_QUESTIONS]**

Questions:
1. ...

Next event: user answers the questions.
```

After a state-changing tool action, update the record before reporting the
result. Never report a transition that was not persisted. Evidence supplied to
the helper must be a compact event receipt, never the goal record being updated,
because the helper embeds evidence into the audit.

The state-helper receipt is sufficient for the next LLM action. It returns the
canonical path, current and next state, legal next events, and a short next
action. Do not issue an immediate `status` or `validate` call after a successful
mutation. Use those commands only when resuming or recovering an ambiguous
mutation result.

`init` accepts one canonical JSON request shape. The required fields are
`id`, `goal`, `cbmIndex`, and `projectRoot`; the optional fields are
`initialContext`, `concerns`, and `requestedOutcome`. Field names are exact
camelCase, and every value must match the documented type. Snake_case aliases,
unknown fields, omitted IDs, wrong value types, and empty values are rejected
with canonical-field guidance. The helper never derives an ID or silently
rewrites a request into another shape.

Independent inspection and validation calls may be issued in one parallel tool
turn. The `advance-batch` command may persist up to six already-prepared,
non-gated context, question, or plan transitions in one write. It must not
cross explicit approval, implementation, test, repair, block/defer, or lesson
boundaries. See the [command catalog](knowledge/command-catalog.md) for its
request shape.

Mutation retries are idempotent only when the same canonical event and exact
evidence were already recorded as the latest audit entry. A whole batch can be
retried only when its matching audit sequence is still the latest sequence. A
repeated `init` for the same canonical request returns the existing record. A
request with a different field shape or different value remains an error, as
does a retry with different evidence; investigate it rather than silently
merging it.

## LLM-led operating model

AIDX is activated by the LLM through `/aidx`; no background process calls the
LLM. The LLM performs the state action and returns evidence to the next turn.
The record supplies resumability, while the deterministic state helper checks
the allowed transition and required output boundary. The helper never chooses
semantic answers, but the finalizer does enforce that the LLM supplied a
disposition, the required branch data, and the delegated receipt before plan
removal.
