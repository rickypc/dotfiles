# Universal runtime protocol

This is a locally authored universal runtime. It deliberately has no upstream
runtime dependency, native-agent layout, `tools/` directory, hooks directory,
Operation phase, or Closure phase.

## Local authority order

1. The user and the project-local AIDLC, when present.
2. `utils/aidlc/stages.ts` for the 18-stage route, ordering, and gates.
3. The temporary intent's validated `gray-matter` frontmatter and stage ledger.
4. This protocol for universal runtime boundaries.
5. The locally authored stage contract for its role, artifact, question, and
   evidence quality.

## Runtime asset protection

During a normal AIDLC run, the assistant may read the conductor, knowledge,
prompts, protocols, and role cards, but it may write only one canonical
temporary-intent path:

```text
~/.agents/aidlc/<validated-cbm-index>/intents/<intent-id>.md
```

Everything else under `~/.agents` is runtime infrastructure: in particular
`aidlc/conductor.md`, `aidlc/knowledge/`, `aidlc/prompts/`,
`aidlc/protocols/`, `aidlc/roles/`, and all `scripts/`, `utils/`, `skills/`,
configuration, adapters, and global instructions. Do not create, edit, move,
or delete any of those assets as part of an intent or project change. The
lifecycle functions reject non-canonical intent paths before they read, write,
or remove a file.

Only an explicit user request naming the runtime asset authorizes a runtime
change. Treat that as a separate code/documentation change with its own
verification; it is never stage evidence and never a substitute for an intent
update. Raw filesystem commands are prohibited by this workflow policy; the
lifecycle validator protects script actions but is not an operating-system
sandbox. Enforce filesystem permissions separately if an untrusted assistant
must be technically unable to bypass the policy.

## Required local adaptations

- Use `~/.agents/scripts/aidlc.ts` and its `aidlc/context.ts` and `sensors.ts`
  helpers. Universal deterministic actions live only in
  `~/.agents/scripts/`; reusable code lives in `~/.agents/utils/`.
- Reverse Engineering (2.1) is the code/context discovery boundary. First use
  `codebase-memory`, then use `knowledge-base` for durable context. The removed
  upstream Practices Discovery stage is not a prerequisite.
- Refined Mockups (2.5) is the only UI-definition stage. It may start from
  requirements, existing UI, user descriptions, or supplied screenshots. It
  does not require a separate rough-mockup or user-story stage.
- Application Design (2.6), Units Generation (2.7), and Delivery Planning
  (2.8) produce the architecture and build sequence that guide Construction.
  They must not require unselected upstream stages.
- Construction 3.1–3.3 are conditional design work; 3.5 consumes whichever
  approved design artifacts apply. Do not require the unselected
  Infrastructure Design stage.
- Build and Test (3.6) runs exactly one project-owned final gate. A project
  declares it once in `<project-root>/aidlc.config.json` as
  `{ "finalGate": "<command>" }`; `bun run test` is the fallback. At 3.6,
  invoke `aidlc.ts complete <intent-path>` with no evidence; it runs the gate,
  returns its receipt, and advances only on exit zero. Failure is failure
  regardless of whether it is cosmetic.
- After 3.6, there is no Closure stage. `knowledge-base` handles persistent
  capture, validation, and any required compression; then retire the intent.
