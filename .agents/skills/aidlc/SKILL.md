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

The central intent is a self-contained decision specification, not a blank
journal. Before the approval handoff, populate its Research, Decisions, Plan,
and Validation evidence with factual content or an explicit, evidence-backed
`N/A`. Research states the question, sources, observed facts, inferences, and
uncertainty. Decisions state the chosen approach, consequences, rejected
alternatives, and unresolved blockers. Plan states ordered construction steps,
owners, dependencies, focused proof, risks, and re-plan triggers. Validation
maps every acceptance item to proof and distinguishes focused checks from the
single final gate. A heading with no content is not a completed handoff.

Greenfield and brownfield work use the same route. Greenfield does not create
extra ceremony; brownfield research is added only where existing behavior can
change an acceptance item. Batching established evidence reduces calls; it is
never a stage bypass.

## Scope profile and context budget

Before `start`, classify the request from observable boundaries. This profile
optimizes reading depth and safe batching; it is not a second route, an
authorization decision, or permission to skip a selected stage.

| Profile | Observable signals | Context and batching posture |
| --- | --- | --- |
| `ui-change` | The product request creates, redesigns, or visually refreshes a user-facing screen or interaction. | Pass `--ui`; read the one UI-definition packet when selected; do not add a second mockup or design ceremony. |
| `small-local-fix` | One known module or behavior boundary, localized implementation, no new public interface/data model/integration, and a focused proof is apparent. | Read only declared packet assets; batch consecutive factual non-gated outcomes; evaluate conditional stages and record evidence-backed skips. |
| `standard-code-change` | Multiple files, a normal behavior change, or a code/test change whose boundary is known but not purely local. | Use the normal packet; batch only already-established consecutive outcomes and keep unresolved decisions visible. |
| `large-cross-cutting` | Multiple subsystems or repositories, public-contract or data changes, integrations, migrations, or material security/performance/reliability risk. | Use the full declared packet for each stage; do not batch uncertain work; treat feasibility, design, NFR, and delivery evidence as presumptively material until evidence says otherwise. |
| `ambiguous` | The request does not establish a boundary or has conflicting signals. | Default to `standard-code-change`; ask one material question only if the ambiguity changes scope, safety, architecture, or the final gate. |

Use concrete boundaries, not adjectives such as “quick,” “simple,” or “big,”
to choose a profile. A profile may make a conditional stage easier to skip
with a factual reason, but it must never skip Intent Capture, Scope Definition,
Approval, Requirements Analysis, Application Design, Units Generation, Code
Generation, Build and Test, or KB closeout. For every profile, preserve the
same typed route, exact returned-action rule, explicit approval, one final gate,
and durable-knowledge disposition. If the profile is revised by new evidence,
use the lifecycle's `replan` action rather than silently changing posture.

## Authorities and protected state

- `utils/aidlc/stages.ts` is the typed authority for the four phases, selected
  18-stage route, conditions, roles, sensors, and packet assets.
- `utils/aidlc/command-contract.ts` is the sole public command grammar.
  `scripts/aidlc.ts` renders it unchanged. Do not maintain, infer, or probe a
  second command table.
- `/codebase-memory` alone owns repository discovery. `/knowledge-base` alone
  owns private-KB root selection, retrieval, capture, and validation.
- The only ordinary write location is
  `<agents-root>/aidlc/<cbm-index>/intents/<intent-id>.md`. The lifecycle
  runtime owns its gray-matter frontmatter. All other runtime assets are
  read-only unless the user explicitly requests a named runtime change.

## Caller-owned router

This is the AIDLC caller router. `utils/aidlc/command-contract.ts` remains the
sole owner of lifecycle command grammar; use its returned action rather than
recreating an executable catalog here.

Path basis: an `aidlc/...` or `skills/...` reference resolves from
`<agents-root>`. A bare `languages/...` or
`software-engineering-work-packets.md` reference resolves from
`<agents-root>/aidlc/knowledge`.

| Command or information | Arguments | When to use | Additional information |
| --- | --- | --- | --- |
| Start lifecycle | `<intent-summary> [--ui] [--initial-record <stage-outcomes-json-array>]` | A selected project needs one AIDLC route and no matching active intent is being resumed. | Use the canonical command-contract row that matches UI and established-evidence state. |
| Returned stage packet | `—` | Immediately after every lifecycle action. | Read only its declared assets and execute only its returned next action. |
| Active intent construction plan | `—` | At Delivery Planning, Code Generation, and Build and Test. | The central temporary intent owns the ordered work, evidence, deviation, and re-plan record. |
| Language guidance | `[observed-language-or-web-profile]` | Repository evidence establishes an applicable implementation language or web surface. | Read `languages/common.md` and only the applicable section in `languages/profiles.md`; do not infer a stack or route through a separate selector. |
| Knowledge context | `—` | The returned AIDLC action requires it or validated context can change a decision. | `/knowledge-base` selects the private-KB root and material concepts; no local router overrides it. |
| Lifecycle recovery | `<returned-arguments>` | The runtime returns an approval, re-plan, closeout, or recovery action. | The command contract remains canonical; do not create a parallel recovery route. |

### Approval and context decision

Use the returned command-contract row that matches the observed state:

| Observed state | Action | Do not do |
| --- | --- | --- |
| Explicit approval plus validated organization/team/project/KB bindings | Use the atomic `approve ... --context ...` action. | Do not run `context.ts resolve` first or call approval twice. |
| Explicit approval but no validated bindings yet | Use `approve <intent-path> <approval-evidence>` alone. | Do not treat the absence of `--context` as a stuck intent. |
| The approval receipt returns `next.action: resolve-knowledge-context` | Execute that exact returned `context.ts resolve` action once, with its returned arguments, then re-read the receipt. | Do not invent a neighboring command, retry with altered arguments, or run it in parallel. |
| A persisted already-approved intent explicitly requires context recovery | Use the standalone resolver only when the runtime returns that recovery action. | Do not use the resolver as a normal pre-approval step. |

When stage evidence or capture JSON contains Markdown code spans, create the
JSON request in an absolute temporary source file with the approved file
editor, then run the mandatory pipe:
`cat <absolute-request-source-path> | bun <agents-root>/scripts/write-json.ts <absolute-json-output-path>`.
Do not use a heredoc, shell redirection, shell variables, or a
double-quoted shell argument containing backticks. The writer's validation and
path policy are owned by the universal runtime and `/knowledge-base`; this
skill owns the lifecycle schema and returned-action selection.

The route selects approve --context as one atomic command and names the typed
AIDLC contract as owner. approve alone is an allowed normal step and a
returned resolve-knowledge-context action is followed exactly once. Evidence
crosses the CLI as a safe file or single-quoted/string-safe boundary. The agent
executes the exact returned action and arguments and continues until a real
gate or terminal result.

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
   When the packet includes `software-engineering-work-packets.md`, use its
   active-stage record to plan the iteration: requirement/source/proof,
   boundary/action/rationale, review finding or clean result, and validation
   mapping must be recorded before claiming the corresponding stage complete.
   When the packet includes language profiles, read `languages/common.md` and
   only the observed section in `languages/profiles.md`; they are home-owned
   guidance, not a reason to infer a stack or add a global command.
3. At 1.7, the returned action is `await-user-approval`. Present one
   evidence-backed handoff and end the response. Do not call `approve` until a
   later user message explicitly approves this intent. Never treat task
   authorization, an earlier approval, a plan summary, or model-written text as
   approval evidence. After that user message, use the returned approval action
   once. The combined approval action can resolve already-validated KB bindings
   and persist already-known consecutive evidence. If the receipt instead
   returns `resolve-knowledge-context`, execute that exact returned action once
   and continue from its receipt. Do not complete this stage separately,
   repeat approval, or guess a context command.
   This is the sole approval boundary. Use `--ui` only when the request has a
   user-facing UI requirement; otherwise the packet deterministically skips
   the UI-only stage. Do not add mockup ceremony outside that conditional stage.
4. Complete or factually skip each applicable stage. Batch consecutive
   non-gated outcomes in one record only when every item is already established.
   Execute only the returned action; never use `--help`, altered retries,
   retired aliases, standalone gate helpers, or direct CBM/KB commands.
   For `small-local-fix`, prefer one evidence-backed batch for adjacent
   conditional skips and completions; for `large-cross-cutting`, keep each
   uncertain decision in its owning stage. Never create a user turn merely to
   narrate a non-blocking stage transition.
5. Before Construction validation, map every acceptance item to an executable
   test, smoke check, or directly observable result. An unmapped item remains
   open even when preliminary checks pass.
   Construction-plan location and proof paths must be absolute existing paths
   at Build and Test. If a source or test moves, reconcile every affected row
   and evidence reference and record the deviation before the final gate.
6. At 3.6, the lifecycle command runs exactly one project-owned final gate:
   `<project-root>/aidlc.config.json` may define `finalGate`; otherwise the
   default is `bun run test`. A non-zero result is failure, including cosmetic
   failure. Repair and rerun the same lifecycle action.
7. If a no-capture or already-validated capture disposition is known before the
   gate, use the atomic closeout action; it gates, records disposition, and
   retires only after success. If a durable concept must be newly captured and
   compressed, a bare successful gate returns the recovery action. Have
   `/knowledge-base` determine the disposition, create the fixed request JSON,
   then call `capture-and-begin` once. Edit only its returned source path or
   paths and
   call its one returned `finalize-and-recover` action. This validates, records
   closeout, and retires together.

## Cross-skill ownership

| Context | Owner | Action |
| --- | --- | --- |
| Direct durable-Markdown work | `/md-compress` | See `skills/md-compress/SKILL.md` direct transaction contract. |
| Standalone KB capture | `/knowledge-base`, then `/md-compress` | See `skills/knowledge-base/SKILL.md`; guard each captured concept with the direct `/md-compress` route. |
| AIDLC durable closeout | AIDLC closeout boundary | Use `capture-and-begin` and its returned `finalize-and-recover`; see `aidlc/conductor.md` and `skills/md-compress/SKILL.md`. |

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
boundaries. Use recovery actions only when the runtime returns them, including
the context resolver returned after approval without validated context.

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

Design-stage comparison is owned by
`aidlc/knowledge/roles/design/interaction-design-patterns.md` (file: `interaction-design-patterns.md`);
its scoring expression is `sum((criterion score / 5) * weight)`.

## Failure and resume

For a repeated request, use the canonical `queue` action to find the matching
intent and resume it when scope remains valid; use `supersede` only when a
replacement intent is genuinely required. The invariant `prepare never overwrites`
an active matching intent.

Malformed intent frontmatter is a repairable lifecycle error. Report the
actionable gray-matter message, repair only the canonical intent through the
supported runtime boundary, and rerun the same action. Do not create another
intent, guess a CBM path, hand-edit route state, or reconstruct state from
folders. A skipped stage records why and continues; only a material unresolved
decision, approval gate, failed final gate, or terminal result stops the route.
