---
name: aidlc
description: Run the universal, four-phase AI-DLC route from a temporary machine-wide intent through one configured final project gate and knowledge-base closeout.
---

# Universal AI-DLC

Use this skill for a code change that needs evidence, a reviewed design, an
explicit approval, implementation, one final project gate, and durable
knowledge capture. This global workflow applies unless the selected project
ships its own `aidlc` skill; a project-local AIDLC always wins.

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
reference. Read every path returned by the stage packet, including the
conductor, protocols, role cards, sensor contracts, and stage prompt.
`aidlc/protocols/runtime.md` defines the universal boundaries and the selected
route has no hidden dependencies on unselected stages.

## Deterministic loop

1. Before work, inspect the queue:

   ```text
   bun ~/.agents/scripts/aidlc.ts queue ~/.agents <cbm-index>
   ```

2. Create or resume one intent, then request its packet:

   ```text
   bun ~/.agents/scripts/aidlc.ts prepare ~/.agents <cbm-index> <absolute-project-root> "<summary>" [--ui]
   ```

   `prepare` validates and records 0.1–0.3 in one deterministic bootstrap,
   then returns the resolved final gate, new intent path, queue snapshot, and
   1.1 stage packet in one response. Add `--ui` only when user-facing UI is in scope. If the
   deterministic id is already active, resume it or explicitly supersede it;
   prepare never overwrites active work. Use `stage.ts next` only after
   recording the current stage outcome.

3. At 2.1, resolve private KB context through `knowledge-base` before reading
   the packet. Run the returned context command only after the skill provides
   validated concept paths.
4. Perform or evidence-skip each conditional stage. A skip is not a pause:
   record a factual reason, run sensors, and request the next packet.
5. At 1.7, present Approve / Re-plan / Decline and stop. Construction begins
   only after the explicit approval is persisted.
6. At 2.5, run one UI-definition pass only when user-facing UI is in scope.
   Use requirements, existing UI, supplied screenshots, and observable UI
   criteria. A non-UI intent has this stage deterministically marked skipped
   from its `ui_required: false` gray-matter metadata. Do not require 1.6
   rough mockups or 2.4 user stories.
7. At 3.6, run exactly one configured final project command:

   ```json
   // <project-root>/aidlc.config.json
   { "finalGate": "go test ./..." }
   ```

   The configuration has one optional string property and one command only.
   If it is absent, use `bun run test`. Run exactly one configured project command through
   `bun ~/.agents/scripts/aidlc/gate.ts run <absolute-project-root>` and save
   its emitted receipt as evidence. Any non-zero result fails the gate and
   must be repaired and rerun: failure is failure. Do not substitute cosmetic, lint,
   coverage, or type commands for this final gate.
8. After 3.6 passes, ask `knowledge-base` to capture any durable lesson,
   validate the KB result, then retire the temporary intent. If no durable
   lesson exists, record that factual outcome and retire without creating a
   placeholder concept.

Use `complete`, `skip`, `approve`, `replan`, `supersede`, and `retire` through
`scripts/aidlc.ts`. Never hand-edit lifecycle frontmatter or create another
intent/log directory.
