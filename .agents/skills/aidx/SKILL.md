---
name: aidx
description: "Run the AIDX goal-to-code lane for an explicit `/aidx` request: inspect a repository from a small initial context, ask material questions, produce an approved implementation plan, make the code changes, test and repair them, distill a durable lesson when warranted, and leave a resumable record."
---

# AIDX — AI Development & Execution Loop

AIDX is an explicit LLM-led interaction lane, not an external autonomous
process. The initial `/aidx` invocation activates the lane; the LLM performs
the reasoning and tool work, while the persisted goal record preserves state
across turns and sessions.

Use the AIDX state contract below and load [state-model.md](references/state-model.md)
when creating, resuming, or repairing a goal record. Load
[knowledge/index.md](references/knowledge/index.md) only when the goal requires
planning, design, implementation, security, or validation guidance; select the
smallest linked branch and do not load the entire knowledge collection.
Load [references/index.md](references/index.md) when selecting conductor,
protocol, role, prompt, or additional knowledge guidance.

## Entry points

- `/aidx <goal and optional concerns>` starts one goal.
- `/aidx resume <goal-id>` resumes the next actionable state.
- `/aidx status <goal-id>` reports state without changing it.

Require one goal per AIDX run. Do not require an epic, curated requirements
package, story breakdown, or pre-written implementation plan.

## Operating contract

At the beginning of every AIDX response, print the current state as:

```text
**[AIDX: <STATE>]**
```

Follow every state in order. A state may complete immediately with factual
evidence, but it must still be represented in the goal record and response.
Do not edit source code before explicit approval of the generated plan.

## Delegated capabilities

Use the narrowest existing skill that owns the requested work. The selected
skill owns its command grammar and proof; AIDX supplies the goal, approval,
scope, and resume boundary.

| Need | Delegate to |
| --- | --- |
| Repository symbols, call paths, architecture, or code text | `/codebase-memory` |
| Durable prior decisions or verified lesson capture | `/knowledge-base` |
| Lossless Markdown compression | `/md-compress` |
| JavaScript or TypeScript static checks | `/biome-tsc-checker` |
| Bun test generation or conversion | `/bun-test-generator` |
| User-facing design direction | `/frontend-design` |
| React or React Native implementation | `/react` |
| Browser regression coverage | `/playwright-test-generator` |
| Research-backed content | `/content-writer` |
| Skill creation, review, or repair | `/skill-manager` |

AIDX is managed as a normal skill by `/skill-manager`; it has no separate
lifecycle manager or special evaluation path.

Do not duplicate a delegated skill's router, command syntax, or ownership rules.

### CAPTURE_GOAL

Create or resume one goal record. Preserve the user's words, concerns,
constraints, repository, and requested outcome. Do not inflate a short goal
into an epic. Move to `INSPECT_CONTEXT`.

### INSPECT_CONTEXT

Read applicable project instructions and inspect only the context needed to
understand the goal. For repository code, invoke `/codebase-memory` and follow
that skill's command contract; do not call CBM, MCP, or a textual fallback
directly. Use `/knowledge-base` only when a validated prior decision or policy
can materially change the plan. Record factual observations, evidence paths,
uncertainties, ownership, dependencies, and likely test surfaces. Move to
`ASK_QUESTIONS`.

### ASK_QUESTIONS

Ask the smallest concise set of questions whose answers can change scope,
behavior, safety, ownership, architecture, or validation. Ask all currently
known material questions together. If there are no material questions, say so,
record that result, and continue to `GENERATE_PLAN`; do not invent a user turn.

Wait for the user's answers when questions exist. On resume, record each answer
and any new uncertainty before moving to `GENERATE_PLAN`.

### GENERATE_PLAN

Synthesize the goal, inspected evidence, answers, decisions, exclusions, and
risks into one implementation plan. The plan must contain:

- observable acceptance criteria;
- affected files, symbols, or boundaries with evidence;
- ordered implementation steps;
- focused tests and one project-appropriate final validation command;
- acceptance-to-proof mapping;
- re-plan triggers and external dependencies;
- a `blocked` or `deferred` disposition when the goal cannot safely proceed.

Present the complete plan to the user. Move to `APPROVE_REVISE`.

### APPROVE_REVISE

Wait for explicit user feedback. If the user revises the goal, answers a newly
material question, or changes scope, increment the plan version, record the
change, and return to `GENERATE_PLAN`. If the user explicitly approves, record
the approval and move to `EXECUTE_PLAN`.

Do not interpret the original request, a plan summary, silence, or model text
as approval.

### EXECUTE_PLAN

Execute the approved steps in order. Use the smallest compatible code change,
reuse existing patterns, and run focused checks as useful. Keep the user out
of non-gated narration; batch adjacent safe steps while preserving step-level
evidence in the record.

If implementation reveals a material scope, architecture, ownership, or
acceptance change, stop editing, record the evidence, and return to
`GENERATE_PLAN`. Do not silently expand the approved plan.

### TEST

Run the focused tests mapped to the acceptance criteria, then the configured
project final gate appropriate to the repository. Distinguish a focused check
from the final gate. Every acceptance item must have proof or remain open.

On failure, record the command, relevant output, diagnosis, and affected plan
step, then move to `REPAIR`. On success, move to `DISTILL_LESSON`.

### REPAIR

Repair only failures within the approved scope. Re-run the failed focused check
and then `TEST`. If the repair requires a new behavior or broader scope, return
to `GENERATE_PLAN` instead. Bound repeated repairs by evidence: after a third
failed attempt at the same boundary, report the blocker and pause rather than
guessing.

### DISTILL_LESSON

Extract at most one or two dense, actionable lessons from observed evidence.
Capture a lesson only when it is durable and verified; otherwise record
`no-durable-lesson` with a short factual reason. Use `/knowledge-base` for a
durable capture and follow its ownership and compression rules. Never store raw
conversation, speculation, or a generic success summary.

### DONE

Record the final status, changed files, validation evidence, approval, lesson
disposition, and any remaining limitations. Report the outcome concisely and
wait for the next `/aidx` request.

## State enforcement

The LLM is the caller, but transitions are checked by the deterministic AIDX
state helper. Use the exact command returned by the record contract:

| Need | Command |
| --- | --- |
| Create a goal record | `bun <agents-root>/scripts/aidx.ts init <absolute-request-json-path>` |
| Read current state | `bun <agents-root>/scripts/aidx.ts status <absolute-goal-record-path>` |
| Validate state and required sections | `bun <agents-root>/scripts/aidx.ts validate <absolute-goal-record-path>` |
| Record a non-transition event | `bun <agents-root>/scripts/aidx.ts note <absolute-goal-record-path> <event> <absolute-evidence-path>` |
| Advance a legal transition | `bun <agents-root>/scripts/aidx.ts advance <absolute-goal-record-path> <event> <absolute-evidence-path>` |
| Record lesson disposition | `bun <agents-root>/scripts/aidx.ts lesson <absolute-goal-record-path> <disposition> <absolute-evidence-path>` |

Create JSON request files only under the operating-system temporary directory
with the shared TypeScript JSON writer. The helper validates legal transitions,
approval before execution, plan presence, validation evidence before closeout,
and durable-lesson disposition before `DONE`. It does not call the LLM or
choose semantic answers; it enforces the boundary around the LLM's work.

## Resume and safety rules

- The goal record is the source of truth; reconstructing state from chat alone
  is not allowed.
- A resumed run reads the current record, reports its state, and performs only
  the next legal action.
- Approval is per goal plan version. A material plan change requires approval
  again.
- `blocked`, `deferred`, and `done` are terminal dispositions; do not turn an
  unresolved dependency into an implementation guess.
- AIDX may call specialized skills, but each skill owns its own command
  grammar. AIDX selects the skill and follows its returned instructions; it
  does not duplicate their routers.
- Do not create durable process artifacts in a repository unless the user or
  repository policy requests them. Store resumable AIDX goal records under the
  skill-local session root defined in [state-model.md](references/state-model.md).
- The canonical goal record is user-editable Markdown. At `ASK_QUESTIONS`, put
  the questions in its `Questions and Answers` section. The user may answer
  there directly or create a sibling `<goal-id>.answers.md`; before planning,
  merge that answer file into the canonical record and record its path.
