---
name: aidlc
description: Run the universal, four-phase AI-DLC route from a temporary machine-wide intent through one configured final project gate and knowledge-base closeout.
---

# Universal AI-DLC

Use this skill to make a code change safer without competing with the change.
Start from the user-visible result, prove it, then use the minimum workflow
state needed to preserve that proof. This global workflow applies unless the
selected project ships its own `aidlc` skill; a project-local AIDLC always wins.

## Task-first operating rule

The task—not lifecycle bookkeeping—is the primary output. Immediately after
`start`, treat the returned `acceptanceChecklist` as the work contract. State
the concise checklist before discussing stages, implement against it, and keep
stage evidence to command receipts, links, and observable results. Never make
the user read a phase report in place of their requested result.

Greenfield and brownfield work follow the same rule. Greenfield does not need
extra ceremony: define the requested behavior, build it, prove it, and retain
only evidence that matters. Brownfield research is added only when existing
behavior can affect an acceptance item.

## Runtime boundaries

- Temporary intent: `~/.agents/aidlc/<cbm-index>/intents/<intent-id>.md`.
  It is the only transient workflow record and uses `gray-matter` frontmatter.
- Durable knowledge: the external private KB, owned solely by
  `knowledge-base`. Resolve its validated `shared/organization`, `shared/team`,
  and `<cbm-index>/project` concepts; do not create a global `.agents/knowledge`
  copy or persist KB content in an intent.
- Code discovery: invoke `codebase-memory`. Do not invoke CBM, MCP, CLI, grep,
  or another search fallback yourself; the skill owns that escalation.
- Deterministic executables live only under `~/.agents/scripts/`. There is no
  global `tools/` directory and no global hooks: native assistant hooks belong
  to a project adapter, not the universal runtime.

## Route

The route has four phases and exactly 18 stages. Operation is excluded. There
is no Closure phase: successful Construction 3.6 immediately triggers
knowledge-base capture/validation and retirement of the temporary intent.

| Phase | Stages |
| --- | --- |
| Initialization | 0.1 Workspace Scaffold; 0.2 Workspace Detection; 0.3 State Initialization |
| Ideation | 1.1 Intent Capture; 1.3 Feasibility; 1.4 Scope Definition; 1.7 Approval & Handoff |
| Inception | 2.1 Reverse Engineering; 2.3 Requirements; 2.5 Refined Mockups; 2.6 Application Design; 2.7 Units Generation; 2.8 Delivery Planning |
| Construction | 3.1 Functional Design; 3.2 NFR Requirements; 3.3 NFR Design; 3.5 Code Generation; 3.6 Build and Test |

The substantive stage contracts are under
`~/.agents/aidlc/prompts/stages/`; `utils/aidlc/stages.ts` is the typed route
reference. Read the returned stage prompt and only the packet assets needed to
answer its current acceptance item; do not repeatedly reload conductor or
protocol documents. `aidlc/protocols/runtime.md` defines the universal
boundaries, including the only temporary-intent write namespace; the selected
route has no hidden dependencies on unselected stages.

## Deterministic commands

Use the commands below exactly. They are deliberately stateful so that one
assistant tool call returns all deterministic information needed for the next
model decision. Do not probe for syntax with `--help`; this table is the
command contract. Do not run `which codebase-memory-mcp`: a command that is
already being executed is already resolved through `PATH`.

| Command | Arguments | Use | Returns |
| --- | --- | --- | --- |
| `start` | `~/.agents <absolute-project-root> "<summary>" [--ui]` | Required once for a new/resumed intent | CBM index, 0.1–0.3 evidence, exact final-gate command, its `aidlc.config.json` path/source, intent path, acceptance checklist, and 1.1 packet |
| `complete` | `<intent-path> "<evidence>"`; at 3.6, `<intent-path>` only | Active non-gated stage is satisfied; at 3.6 it executes the gate | Persisted state and next action; 3.6 returns the canonical receipt plus closeout/repair action |
| `skip` | `<intent-path> "<factual reason>"` | Active non-gated stage is inapplicable | Persisted state and the next actionable packet |
| `record` | `<intent-path> '[{"stage":"<active-stage>","outcome":"<complete-or-skip>","evidence":"<factual evidence>"}]' [--final-gate]` | Several consecutive non-gated outcomes are ready; optionally finish with 3.6 | One persisted batch and the next actionable packet; `--final-gate` executes the configured gate and cannot accept model-written 3.6 evidence |
| `approve` | `<intent-path> "<handoff evidence>"` | The user explicitly approves an active 1.7 handoff | Atomically persists the handoff and approval, then returns the next required action |
| `queue` | `~/.agents <cbm-index>` | Diagnostics only | Current intent inventory; `start` already includes it |
| `replan` | `<intent-path> "<evidence>"` | User changes an approved direction without replacing the intent | Lifecycle result and current next action |
| `supersede` | `<intent-path> <replacement-intent-id>` | User replaces an active direction | Supersession result and exact replacement-start action |
| `closeout` | `<intent-path> --captured <private-kb-root> <concept-path>` | After 3.6 when `knowledge-base` captured durable knowledge | Revalidates the captured concept and KB indexes, persists closeout, and returns `retire` |
| `closeout` | `<intent-path> --no-durable-lesson "<knowledge-base assessment>"` | After 3.6 when `knowledge-base` determines no durable lesson belongs in the KB | Persists the factual no-capture assessment and returns `retire` |
| `retire` | `<intent-path>` | Only after a persisted KB closeout | Removes the temporary intent |

One helper command is intentionally not a lifecycle command. Its syntax is
fixed here; never call it with `--help`.

| Helper | Arguments | Use | Returns |
| --- | --- | --- | --- |
| `context.ts resolve` | `<intent-path> <private-kb-root> <organization-ref\|-> <team-ref\|-> <project-ref\|->` | Only at 2.1, after `knowledge-base` returns validated concept references | Persists context and the 2.1 packet; `-` means no binding at that layer |

Start exactly once; it owns CBM project selection and final-gate resolution:

```text
bun ~/.agents/scripts/aidlc.ts start ~/.agents <absolute-project-root> "<summary>" [--ui]
```

`start` uses the CBM project list internally and accepts only an explicit
indexed-root match. It never infers that child paths share a parent project;
separately indexed nested roots remain separate. If no mapping exists, it
returns an actionable indexing error instead of creating an intent under a
guessed name. Add `--ui` only when a user-facing UI is in scope. If the
deterministic id is already active, resume it or explicitly supersede it;
`start` never overwrites active work. Its `finalGate` result names the exact
command, absolute configuration path, and whether that command came from
project configuration or the `bun run test` default. It intentionally omits
unrelated queued intents; use `queue` only for explicit lifecycle
reconciliation.

At 2.1, resolve private KB context through `knowledge-base` before reading
   the packet. Run the returned context command only after the skill provides
   validated concept paths.
Perform or evidence-skip each conditional stage. A skip is not a pause:
record a factual reason and use the returned next packet. Prefer `record` when
the model has concise evidence for consecutive stages; it must batch every
already-known direct successor rather than call `complete` once per stage merely
to receive another packet. Use `complete` only when one active stage genuinely
depends on a result not yet available to the model. Approval and the final gate
each have a dedicated atomic command.

## `record` JSON contract

`record` starts with the active stage and may include only its direct,
non-gated successors. Its input is one JSON array. Every entry requires a
`stage`, an explicit `outcome`, and concise factual `evidence`. `outcome` is
exactly `"complete"` or `"skip"`; use `"skip"` only when that particular stage
is factually inapplicable. It is one batch command, not one command per stage.

```text
# Complete three consecutive stages in one call.
bun ~/.agents/scripts/aidlc.ts record <intent-path> '[
  {"stage":"intent-capture","outcome":"complete","evidence":"Requested behavior and acceptance checklist captured."},
  {"stage":"feasibility","outcome":"complete","evidence":"Existing adapters support the change without a new dependency."},
  {"stage":"scope-definition","outcome":"complete","evidence":"In-scope behavior, verification, and exclusions are explicit."}
]'

# Skip exactly one active conditional stage.
bun ~/.agents/scripts/aidlc.ts record <intent-path> '[
  {"stage":"refined-mockups","outcome":"skip","evidence":"No user-facing UI is in scope."}
]'
```

Do not include `approval-handoff` or `build-and-test` in a batch. To record
Code Generation and execute 3.6 in one call, end a record batch at
`code-generation` and append `--final-gate`; the script executes the one
configured gate itself. Do not batch past 2.1 until `knowledge-base` has
resolved its context. The emitted response is the only next-step source;
never retry a command with altered arguments merely to discover its syntax.

At 1.7, present Approve / Re-plan / Decline and stop. Construction begins
   only after the explicit approval is persisted. When the user explicitly
   approves the active handoff, call exactly once:

   ```text
   bun ~/.agents/scripts/aidlc.ts approve <intent-path> "<concise handoff evidence; user explicitly approved>"
   ```

   This atomically completes 1.7 and records approval. Do not call `complete`
   first, then `approve`; do not call `approve` before the user responds.
At 2.5, run one UI-definition pass only when user-facing UI is in scope.
   Use requirements, existing UI, supplied screenshots, and observable UI
   criteria. A non-UI intent has this stage deterministically marked skipped
   from its `ui_required: false` gray-matter metadata. Do not require 1.6
   rough mockups or 2.4 user stories.
At 3.6, run exactly one configured final project command:

   In `<project-root>/aidlc.config.json`:

   ```json
   { "finalGate": "<project-final-gate-command>" }
   ```

   The configuration has one optional string property and one command only.
   It is the project's final acceptance command: configure it to verify the
   relevant acceptance checklist, including end-to-end or browser behavior when
   those are in scope. If it is absent, use `bun run test`. Run direct
   CLI/browser acceptance checks before the final gate, then run exactly one
   configured project command by calling
   `bun ~/.agents/scripts/aidlc.ts complete <intent-path>` at 3.6. It executes
   the gate, persists its canonical receipt on success, and returns
   `knowledge-base-closeout-and-retire`. On failure it leaves the stage active,
   returns `repair-and-rerun-final-gate`, and exits non-zero. Never call
   `gate.ts` or supply model-written 3.6 evidence in the AIDLC route. Any
   non-zero result fails the gate and
   must be repaired and rerun: failure is failure. Do not substitute cosmetic, lint,
   coverage, or type commands for this final gate.
After 3.6 passes, ask `knowledge-base` to capture and validate any durable
   lesson. Then use exactly one closeout command before retirement:

   ```text
   bun ~/.agents/scripts/aidlc.ts closeout <intent-path> --captured <private-kb-root> <concept-path>
   ```

   If `knowledge-base` determines that no durable lesson exists, do not create
   a placeholder concept. Record its factual assessment instead:

   ```text
   bun ~/.agents/scripts/aidlc.ts closeout <intent-path> --no-durable-lesson "<knowledge-base assessment>"
   ```

   `retire <intent-path>` rejects any intent without one of these persisted
   closeouts.

Use `complete`, `skip`, `approve`, `replan`, `supersede`, `closeout`, and `retire` through
`scripts/aidlc.ts`. Never hand-edit lifecycle frontmatter or create another
intent/log directory.
