---
name: aidlc
description: Run the universal four-phase AI-DLC route from one temporary intent through one final project gate and knowledge-base closeout.
---

# Universal AI-DLC

Use this skill when a code change needs explicit intent, evidence-backed design,
controlled implementation, one final project gate, and knowledge-base closeout.
A project-local `aidlc` skill always takes precedence over this global skill.

## Task-first rule

The task—not lifecycle bookkeeping—is the primary output. `start` returns an
acceptance checklist; make that checklist the work contract. Evidence is concise
and factual: command receipts, observed behavior, links, and decisions. Do not
replace the requested result with phase narration.

Greenfield and brownfield work use the same route. Greenfield does not create
extra ceremony; brownfield research is added only where existing behavior can
change an acceptance item. Batching established evidence reduces calls; it is
never a stage bypass.

## Authorities and protected state

- `utils/aidlc/stages.ts` is the typed authority for the four phases, selected
  18-stage route, conditions, roles, sensors, and packet assets.
- `utils/aidlc/command-contract.ts` is the sole public command grammar.
  `scripts/aidlc.ts` renders it unchanged. Do not maintain, infer, or probe a
  second command table.
- `codebase-memory` alone owns repository discovery. `knowledge-base` alone
  owns private-KB root selection, retrieval, capture, and validation.
- The only ordinary write location is
  `<agents-root>/aidlc/<cbm-index>/intents/<intent-id>.md`. The lifecycle
  runtime owns its gray-matter frontmatter. All other runtime assets are
  read-only unless the user explicitly requests a named runtime change.

## Operating route

1. From the selected `<project-root>`, use the normal `start` row in the
   canonical command catalog. The executing script derives `<agents-root>` and
   the current directory is the project root; never supply either root, a
   guessed CBM index, or a workspace path. It resolves the index, records
   Initialization, and returns the checklist, exact final gate, intent path,
   and first packet.
2. Work only from the returned packet. Its knowledge paths are the typed,
   stage-curated required reading set; do not expand them to every file owned by
   an assigned role, reload unrelated material, or invent unselected stages.
3. At 1.7, the returned action is `await-user-approval`. Present one
   evidence-backed handoff and end the response. Do not call `approve` until a
   later user message explicitly approves this intent. Never treat task
   authorization, an earlier approval, a plan summary, or model-written text as
   approval evidence. After that user message, use the returned approval action
   once. The combined approval action can resolve already-validated KB bindings
   and persist already-known consecutive evidence.
4. Complete or factually skip each applicable stage. Batch consecutive
   non-gated outcomes in one record only when every item is already established.
   Execute only the returned action; never use `--help`, altered retries,
   retired aliases, standalone gate helpers, or direct CBM/KB commands.
5. Before Construction validation, map every acceptance item to an executable
   test, smoke check, or directly observable result. An unmapped item remains
   open even when preliminary checks pass.
6. At 3.6, the lifecycle command runs exactly one project-owned final gate:
   `<project-root>/aidlc.config.json` may define `finalGate`; otherwise the
   default is `bun run test`. A non-zero result is failure, including cosmetic
   failure. Repair and rerun the same lifecycle action.
7. If a no-capture or already-validated capture disposition is known before the
   gate, use the atomic closeout action; it gates, records disposition, and
   retires only after success. If a durable concept must be newly captured and
   compressed, a bare successful gate returns the recovery action. Have
   `knowledge-base` determine the disposition, create the fixed request JSON,
   then call `capture-and-begin` once. Edit only its returned source path or
   paths and
   call its one returned `finalize-and-recover` action. This validates, records
   closeout, and retires together.

## Cross-skill ownership

| Context | Owner | Preconditions | Assistant action | Result | Prohibited action |
| --- | --- | --- | --- | --- | --- |
| Direct durable-Markdown work | `md-compress` | No AIDLC session; one eligible Markdown source. | Call direct `begin`, edit only its returned source, then call its returned `finalize`. | Token validation and cleanup. | Do not capture KB knowledge or infer an AIDLC session. |
| Standalone KB capture | `knowledge-base`, then `md-compress` | Durable capture is requested outside AIDLC. | Capture the validated concept, then use the direct `md-compress` route. | Captured concept and separate direct guard receipt. | Do not claim that AIDLC began compression. |
| AIDLC durable closeout | AIDLC closeout boundary | Passed final gate, no persisted closeout/session, and one fixed single-capture or reconciliation request JSON file. | Call `capture-and-begin`; edit only its returned source path or paths; call only returned `finalize-and-recover`. | Every captured concept guarded and validated; persisted closeout; retired intent. | Do not call direct `md-compress begin`, `related`, `reconcile`, invoke `recover`, or create a second session. |

An AIDLC compression-session packet is explicit data: owner, source path,
backup path, lock path, and one exact next action. Its absence means no AIDLC
session exists.

`utils/aidlc/command-contract.ts` owns the complete command catalog. Apply
`aidlc/knowledge/shared/command-catalog.md` when authoring any derived table;
do not duplicate or infer command grammar here.

## Batching boundaries

Use the canonical command catalog’s priority order. In particular, when user
approval and factual post-approval evidence are both ready, use the one
combined approval-and-record action; never call approval and record separately
for the same facts. Approval Handoff and Build and Test remain atomic
boundaries. Use recovery actions only when the runtime returns them.

## Stage quality

- Product turns the request into observable acceptance and maps it to proof.
- Architecture defines the smallest compatible boundaries and implementation
  sequence; it does not add a small-task route.
- Development makes the minimum change, reuses existing code, and removes only
  artifacts made dead by the current change. Pre-existing dead code requires a
  user decision.
- Quality distinguishes focused development smoke checks from the one final
  project gate and reports any unmapped acceptance item.
- Security scopes controls and evidence to the intent; it does not add a
  parallel universal scanner or gate.

## Failure and resume

Malformed intent frontmatter is a repairable lifecycle error. Report the
actionable gray-matter message, repair only the canonical intent through the
supported runtime boundary, and rerun the same action. Do not create another
intent, guess a CBM path, hand-edit route state, or reconstruct state from
folders. A skipped stage records why and continues; only a material unresolved
decision, approval gate, failed final gate, or terminal result stops the route.
