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

This section is intentionally user-editable. A user can answer inline, or
provide a sibling `<goal-id>.answers.md` file. The LLM must merge the latter
into this section before generating a plan and record the source path in the
inspection or audit evidence.

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

## Legal transitions

```text
CAPTURE_GOAL
  → INSPECT_CONTEXT
INSPECT_CONTEXT
  → ASK_QUESTIONS
ASK_QUESTIONS
  → GENERATE_PLAN
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
  → DONE
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
result. Never report a transition that was not persisted.

## LLM-led operating model

AIDX is activated by the LLM through `/aidx`; no background process calls the
LLM. The LLM performs the state action and returns evidence to the next turn.
The record supplies resumability, while the deterministic state helper checks
the allowed transition and required output boundary. The helper never becomes
a second caller router and never chooses semantic answers.
