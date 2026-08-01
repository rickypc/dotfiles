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
`~/.agents/prompts/aidlc/stages/`; `utils/aidlc/stages.ts` is the typed route
reference. Read the returned stage prompt and only the packet assets needed to
answer its current acceptance item; do not repeatedly reload conductor or
protocol documents. `aidlc/protocols/runtime.md` defines the universal
boundaries and the selected route has no hidden dependencies on unselected
stages.

## Deterministic commands

Use the commands below exactly. They are deliberately stateful so that one
assistant tool call returns all deterministic information needed for the next
model decision. Do not probe for syntax with `--help`; this table is the
command contract. Do not run `which codebase-memory-mcp`: a command that is
already being executed is already resolved through `PATH`.

| Command | Arguments | Use | Returns |
| --- | --- | --- | --- |
| `start` | `~/.agents <absolute-project-root> "<summary>" [--ui]` | Required once for a new/resumed intent | CBM index resolved from an explicit indexed-root mapping, 0.1–0.3 evidence, final gate, queue snapshot, intent path, and 1.1 packet |
| `complete` | `<intent-path> "<evidence>"` | Active non-gated stage is satisfied | Persisted state and the next actionable packet |
| `skip` | `<intent-path> "<factual reason>"` | Active non-gated stage is inapplicable | Persisted state and the next actionable packet |
| `record` | `<intent-path> '<stage-outcomes-json>'` | Several consecutive non-gated outcomes are ready | One persisted batch and the next actionable packet; it cannot cross approval or KB-context boundaries |
| `approve` | `<intent-path>` | User explicitly approves at 1.7 | Persisted approval and the next required action |
| `queue` | `~/.agents <cbm-index>` | Diagnostics only | Current intent inventory; `start` already includes it |
| `replan` / `supersede` | Existing lifecycle arguments | User changes an approved direction | Lifecycle result only |
| `retire` | Existing KB arguments | After 3.6 and KB closeout | Removes the temporary intent |

Start exactly once; it owns CBM project selection and queue inspection:

```text
bun ~/.agents/scripts/aidlc.ts start ~/.agents <absolute-project-root> "<summary>" [--ui]
```

`start` uses the CBM project list internally and accepts only an explicit
indexed-root match. It never infers that child paths share a parent project;
separately indexed nested roots remain separate. If no mapping exists, it
returns an actionable indexing error instead of creating an intent under a
guessed name. Add `--ui` only when a user-facing UI is in scope. If the
deterministic id is already active, resume it or explicitly supersede it;
`start` never overwrites active work.

At 2.1, resolve private KB context through `knowledge-base` before reading
   the packet. Run the returned context command only after the skill provides
   validated concept paths.
Perform or evidence-skip each conditional stage. A skip is not a pause:
record a factual reason and use the returned next packet. Prefer `record` when
the model has concise evidence for consecutive stages; do not call `complete`
once per stage merely to receive another packet.

At 1.7, present Approve / Re-plan / Decline and stop. Construction begins
   only after the explicit approval is persisted.
At 2.5, run one UI-definition pass only when user-facing UI is in scope.
   Use requirements, existing UI, supplied screenshots, and observable UI
   criteria. A non-UI intent has this stage deterministically marked skipped
   from its `ui_required: false` gray-matter metadata. Do not require 1.6
   rough mockups or 2.4 user stories.
At 3.6, run exactly one configured final project command:

   ```json
   // <project-root>/aidlc.config.json
   { "finalGate": "go test ./..." }
   ```

   The configuration has one optional string property and one command only.
   It is the project's final acceptance command: configure it to verify the
   relevant acceptance checklist, including end-to-end or browser behavior when
   those are in scope. If it is absent, use `bun run test`. Run exactly one configured project command through
   `bun ~/.agents/scripts/aidlc/gate.ts run <absolute-project-root>` and save
   its emitted receipt as evidence. The receipt is automatic; do not replace
   it with narrated validation. Any non-zero result fails the gate and
   must be repaired and rerun: failure is failure. Do not substitute cosmetic, lint,
   coverage, or type commands for this final gate.
After 3.6 passes, ask `knowledge-base` to capture any durable lesson,
   validate the KB result, then retire the temporary intent. If no durable
   lesson exists, record that factual outcome and retire without creating a
   placeholder concept.

Use `complete`, `skip`, `approve`, `replan`, `supersede`, and `retire` through
`scripts/aidlc.ts`. Never hand-edit lifecycle frontmatter or create another
intent/log directory.
