---
name: aidx
description: "Run the AIDX goal-to-code lane for an explicit `/aidx` request: inspect a repository from a small initial context, ask material questions, produce an approved implementation plan, make the code changes, test and repair them, always review the original plan at finalization, and leave a resumable record."
---

# AIDX — AI Development & Execution Loop

AIDX is an explicit LLM-led interaction lane, not an external autonomous
process. The initial `/aidx` invocation activates the lane; the LLM performs
the reasoning and tool work, while the persisted goal record preserves state
across turns and sessions.

## Canonical naming and request shape

Use the spelling shown here exactly; do not invent a second spelling.

- Use `camelCase` for JSON request fields, TypeScript properties, and CLI
  object keys: `cbmIndex`, `projectRoot`, `initialContext`,
  `requestedOutcome`, and `evidencePath`.
- Use `snake_case` only for persisted goal frontmatter keys and canonical
  lifecycle event values: `cbm_index`, `project_root`, `inspect_context`, and
  `tests_passed`.
- Use `PascalCase` for TypeScript types and classes: `AidxGoalDocument` and
  `AidxLessonDisposition`.
- Do not mix styles in one object. Do not guess a spelling from a nearby
  example. If a value is not in this contract, stop and ask for the contract.

The canonical init request is one JSON object with required fields
`id: string`, `goal: string`, `cbmIndex: string`, and `projectRoot: string`,
plus optional `initialContext: string`, `concerns: string[]`, and
`requestedOutcome: string`. The canonical batch request is one JSON object
with `steps: Array<{event: string, evidencePath: string}>`. Snake-case input
fields are rejected with the corresponding camelCase field named in the
error; they are not alternate request shapes.

## Configuration and final gate

Resolve the project final gate from `<projectRoot>/aidx.json`; when that file
is absent, use the default `bun run test`. The JSON object may contain one
`finalGate` property whose value is a string. A malformed configuration is an
error, not a fallback to the default. The AIDX `TEST`
state executes exactly one resolved final gate. Before that invocation, do not run a
test, lint, type, coverage, or checker command whose work is included in the
resolved `finalGate`; the gate is the one execution and proof for that work.
Run a focused command only when it is not covered by the gate or when a failed
gate needs diagnostic narrowing. Never run a test subset and then run a gate
that runs the same test subset merely because both appear in the plan.
The TEST state is the only final validation decision.

Use the AIDX state contract below and load [state-model.md](references/state-model.md)
when creating, resuming, or repairing a goal record. Load
[knowledge/index.md](references/knowledge/index.md) only when the goal requires
planning, design, implementation, security, or validation guidance; select the
smallest linked branch and do not load the entire knowledge collection.
Load [references/index.md](references/index.md) when selecting conductor,
protocol, role, prompt, or additional knowledge guidance.

## Portable lifecycle boundary

AIDX carries portable clarification, explicit plan approval and revision,
returned-action discipline, persisted evidence, one final-gate decision,
acceptance-to-proof mapping, repair/re-plan behavior, and deterministic final
plan review with delegated durable-lesson disposition. These quality controls
belong in the compact goal-to-code lane.

Do not import a separate mandatory multi-stage route, temporary intent
lifecycle, stage-role or sensor-packet orchestration. Those features belong to
another lifecycle and would make AIDX duplicate its route and add ceremony.
The finalizer is the narrow exception for this lane: it delegates durable
capture to `/knowledge-base`, validates the returned receipt, and retires the
active plan only after the branch contract succeeds. If a future AIDX
requirement needs another cross-skill boundary, add the smallest typed
contract that proves the requirement; do not copy an entire external
conductor.

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

Keep state-helper calls single-purpose and receipt-driven. `init` is called
once; a successful receipt already identifies the canonical goal path and next
action. A successful `advance`, `note`, or `distill` receipt already contains
the current state and next legal events, so do not immediately call `status`
or `validate`. Use those read commands only for resume or ambiguous-retry
recovery.

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
lifecycle manager or special evaluation path. Its frozen evaluation matrix is
at [evals/cases.jsonl](evals/cases.jsonl), with the interpretation rules in
[evals/rubric.md](evals/rubric.md). Run the Skill Manager baseline, candidate,
and challenge evaluation for this matrix as part of every AIDX skill update.

Do not duplicate a delegated skill's router, command syntax, or ownership rules.

### CAPTURE_GOAL

Create or resume one goal record. Preserve the user's words, concerns,
constraints, repository, and requested outcome. Do not inflate a short goal
into an epic. Move to `INSPECT_CONTEXT`.

### INSPECT_CONTEXT

Read applicable project instructions and inspect only the context needed to
understand the goal. For repository code, invoke `/codebase-memory` and follow
that skill's command contract; do not call CBM, MCP, or a textual fallback
directly. For durable prior decisions, policies, or verified lessons, invoke
`/knowledge-base` and follow its search contract. Use both sources during the
same context pass when a repository goal could be affected by either: run the
independent CBM and KB reads in parallel, then merge their receipts before
asking questions. CBM is authoritative for current code facts; validated KB
concepts are authoritative for durable context. Neither source silently
overrides the other, and an empty or stale KB result is recorded as a
limitation, not filled with an assumption. For several independent reads
needed for one decision, use each owner's single inspect/search request rather
than serially repeating calls. Record factual observations, both evidence
receipts, uncertainties, ownership, dependencies, and likely test surfaces.
Move to `ASK_QUESTIONS`.
When requirements remain materially ambiguous, load the smallest relevant
product requirements guide and elicitation reference before asking questions.

### ASK_QUESTIONS

Before asking, resolve facts from project instructions, code discovery,
validated knowledge, and the goal record. Classify every remaining gap as one
of these:

- `unknown-fact`: research or inspect it first; ask the user only when the fact
  cannot be established safely from available sources.
- `user-decision`: ask the user when it changes scope, behavior, safety,
  ownership, architecture, constraints, or proof.
- `assumption`: do not silently use it; either validate it or turn it into a
  user question.

Run a scope-appropriate completeness pass before planning. Cover actors and
trigger, happy path, error and boundary cases, acceptance outcomes, constraints
and explicit non-goals, data and integrations, security and privacy,
performance and compatibility, ownership and rollout, and the final proof.
For each requirement, probe at least one failure or unusual condition. Do not
stop merely because the initial request sounds clear; stop when every
material gap is resolved, explicitly limited, or deferred by the user.

Ask one material question at a time when answers depend on each other. Ask a
focused batch only for questions that are independent. Each question must
state why it matters, identify the missing fact or decision, and include a
recommended answer only when current evidence supports one. Never use a
preference, guess, or generated plan as evidence.

After every answer, update the fact/decision ledger and rerun the completeness
pass. If any material gap, ambiguity, contradiction, or misunderstood answer
remains, stay in `ASK_QUESTIONS` and ask the next focused question. Do not
generate a plan merely because the user answered the previous question. Move
to `GENERATE_PLAN` only when all material requirements are understood, or the
user explicitly defers or limits the remaining item and its consequence is
recorded. If no material question is needed initially, record that factual
result and continue without manufacturing a user turn.

Ask the questions directly in the conversation and wait for the user's reply.
On the next turn, record each answer and any new uncertainty in the canonical
goal record before either asking another question or moving to
`GENERATE_PLAN`. Do not create a separate question artifact, one answer
artifact per question, or a sibling `<answer-artifact>` file for the normal
interactive path. A separate handoff artifact is allowed only when the user
explicitly requests offline editing or a file-based resume workflow.

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

The goal record MUST contain exactly one active `## Plan v<N>` section. When a
plan is revised, replace the active plan with the complete revised plan and
retain only a compact change note in the audit; never append another full plan,
copy the prior plan, or embed the goal record inside its own evidence.
The plan-generation owner reads the persisted `plan_version`: it creates `v1`
only for a new goal with version `0`, otherwise it replaces the active plan
with the next version. The state transition that records `plan_ready` owns the
metadata increment and rejects stale, duplicated, or reset headings. Plan
versions are monotonic for the life of a goal and MUST NOT reset to `v1`.

`current_step` counts every persisted lifecycle transition. `plan_version`
counts generated revisions of the one active plan; it does not equal the
lifecycle step count and must not be derived from it.

Present the complete plan to the user. Move to `APPROVE_REVISE`.

### APPROVE_REVISE

Wait for explicit user feedback. If the user revises the goal, answers a newly
material question, or changes scope, record the compact change request and
return to `GENERATE_PLAN`. Do not increment or rewrite `plan_version` in this
state: the plan-generation owner reads the persisted version, replaces the
single active plan with the next heading, and the `plan_ready` transition
persists the increment. If the user explicitly approves, record the approval
and move to `EXECUTE_PLAN`.

Do not interpret the original request, a plan summary, silence, or model text
as approval.

### EXECUTE_PLAN

Execute the approved steps in order. Use the smallest compatible code change
and reuse existing patterns. Do not execute tests or checkers already covered
by the resolved final gate. Run a focused command only when it is non-overlap-
ping or is needed to diagnose a failure, and record that reason. Keep the user
out of non-gated narration; batch adjacent safe steps while preserving
step-level evidence in the record.

If implementation reveals a material scope, architecture, ownership, or
acceptance change, stop editing, record the evidence, and return to
`GENERATE_PLAN`. Do not silently expand the approved plan.

Group independent read-only inspection, static checks, or validation commands
in one tool turn when the runtime supports parallel calls. Do not group calls
whose result changes the arguments of a later call; preserve those as separate
evidence boundaries.

### TEST

Complete the approved implementation batch before validation; do not run the
gate after each small edit. First compare every proposed focused command with
the resolved final-gate command. Do not execute a covered focused test or
checker separately. Run only non-overlapping or diagnostic-focused checks,
then run the single resolved final gate. Every acceptance item must have proof
or remain open; when the final gate supplies that proof, record it as covered
by the gate rather than executing it twice.

On failure, record the command, relevant output, diagnosis, and affected plan
step, then move to `REPAIR`. On success, move to `DISTILL_LESSON`.

### REPAIR

Repair only failures within the approved scope. Group all failures in the same
boundary, apply the complete repair batch, then use one diagnostic-focused
check only if it narrows the failure and is not already covered by the final
gate. Run the single final gate after the complete repair batch. If the repair
requires new behavior or broader scope, return to `GENERATE_PLAN`. After a
third failed attempt at the same boundary, report the blocker and pause rather
than guessing.

### DISTILL_LESSON

Always review the original active plan before closeout. The LLM must produce
one structured decision containing the current plan version and exactly one
disposition. If the disposition is positive, use `/knowledge-base` to search,
reconcile, and return its receipt before invoking the AIDX finalizer. If the
disposition is `no-durable-lesson`, include a non-empty factual justification;
do not call `/knowledge-base` for capture. The deterministic finalizer validates
the branch, validates the delegated receipt when required, records a compact
plan digest, removes the active plan, and only then permits `lesson_complete`.
Never store raw conversation, speculation, or a generic success summary.

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
| Advance several prepared, non-gated transitions | `bun <agents-root>/scripts/aidx.ts advance-batch <absolute-goal-record-path> <absolute-batch-json-path>` |
| Finalize the mandatory plan review | `bun <agents-root>/scripts/aidx.ts distill <absolute-goal-record-path> <absolute-distill-decision-json-path>` |

Create JSON request files only under the operating-system temporary directory
with the shared TypeScript JSON writer. The helper validates legal transitions,
approval before execution, plan presence until finalization, validation
evidence before closeout, and the finalizer decision before `DONE`. The init
request has one strict
canonical schema: `id`, `goal`, `cbmIndex`, and `projectRoot` are required;
`initialContext`, `concerns`, and `requestedOutcome` are optional. Field names
are camelCase exactly as shown; snake_case names, unknown fields, missing IDs,
wrong value types, and empty values fail with a canonical-field error. The
request shape is:

```json
{
  "id": "<stable-goal-id>",
  "goal": "<goal-text>",
  "cbmIndex": "<validated-cbm-index>",
  "projectRoot": "<absolute-project-root>",
  "initialContext": "<optional-context>",
  "concerns": ["<concern>"],
  "requestedOutcome": "<requested-outcome>"
}
```

It does not call the LLM or choose semantic answers; it enforces the boundary
around the LLM's work. Event inputs use canonical snake_case and the narrow
hyphenated spelling normalizer; receipts and persisted audit entries always
use canonical event names.

The finalizer decision JSON is fixed-arity at the command boundary and uses
this pattern:

```json
{
  "planVersion": <current-plan-version>,
  "disposition": "<no-durable-lesson|new-primary|update-existing>",
  "justification": "<required when disposition is no-durable-lesson>",
  "knowledgeBaseReceiptPath": "<absolute-receipt-path required for a positive disposition>"
}
```

The negative branch must contain `justification` and must omit
`knowledgeBaseReceiptPath`. A positive branch must contain
`knowledgeBaseReceiptPath`; the receipt must be returned by `/knowledge-base`
after its own validation and reconciliation contract. The finalizer reads the
active plan before removing it, so a failed decision or failed receipt leaves
the plan available for recovery.

`advance-batch` accepts a JSON object with one to six steps:

```json
{
  "steps": [
    {"event": "<event-name>", "evidencePath": "<absolute-compact-evidence-path>"}
  ]
}
```

For the normal interactive question flow, use a compact event-specific evidence
receipt. Never pass the canonical goal record as its own evidence path: the
helper embeds evidence content into the audit, so doing so recursively copies
the entire record. The user answers in chat and the LLM records the answer in
the goal record. Do not create a sibling question or answer artifact unless
the user explicitly requests file-based resume.

The helper reads all evidence before writing the record and writes once only
if every step is valid. It permits only prepared context, question, or plan
transitions. Do not use it for approval, source edits, test results, repair,
blocking, deferral, or lesson closeout. Those boundaries require their own
receipt and may require user input or new external evidence.

## Resume and safety rules

- The goal record is the source of truth; reconstructing state from chat alone
  is not allowed.
- A resumed run reads the current record, reports its state, and performs only
  the next legal action.
- A repeated `init` for the same canonical request returns `existing` and the
  canonical record path. A request with snake_case, unknown, missing, or
  malformed fields is rejected with the canonical schema guidance; do not
  translate it into a second request shape.
- A repeated `advance` with the same canonical event and evidence returns
  `already-applied`; do not retry it with a neighboring event. A hyphenated
  event spelling is normalized once to the canonical snake_case event.
- If a mutation command returns an error and its commit status is ambiguous,
  call `status` once before retrying. Never retry a mutation with altered
  arguments merely because the first receipt was not read.
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
- The canonical goal record is the single durable AIDX record. At
  `ASK_QUESTIONS`, ask questions in chat; after the user replies, record the
  questions, answers, consequences, and any decisions in that record. Do not
  generate separate question or answer Markdown files unless the user
  explicitly requests a file-based workflow.

## Batch transition discipline

When two or more consecutive prepared non-gated transitions are legal and their evidence is already available, materialize one batch request and invoke `advance-batch` once. Do not issue adjacent individual `advance` commands for transitions that the state contract permits in one batch. Individual transitions remain required for approval, user answers, test receipts, repair receipts, or any event whose next state is not yet known.

The context pass is mandatory for every nontrivial AIDX run: `/codebase-memory` supplies current repository facts and `/knowledge-base` supplies durable prior context. Use the smallest targeted CBM inspection and one bounded KB search-batch; do not read whole files or repeat queries. After validation, always review the original plan; capture a factual reusable lesson through `/knowledge-base` only for a positive disposition, and justify a negative disposition.

Execution is one complete change batch followed by one final-gate invocation. Do not run focused tests or checker commands that overlap the resolved final gate. If the gate fails, repair the complete compatible boundary together and invoke the final gate once for that repair batch. Never run the same checker, final gate, query, or transition concurrently.

## JSON request materialization

AIDX request files are text files, not object-valued tool arguments. Use one OS temp directory per workflow and distinct files only when a state contract requires distinct artifacts. Every path must be printed by standalone mktemp or proven by os.tmpdir(); never type a platform temp path or reuse a placeholder. Pass backticks and dollar signs as escaped Unicode in JSON. If a heredoc is rejected, send the same JSON text through one bounded stdin session to write-json.ts with the exact printed path, then verify its receipt before invoking AIDX.
