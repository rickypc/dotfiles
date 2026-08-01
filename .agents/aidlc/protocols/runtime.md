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

## Required local adaptations

- Use `~/.agents/scripts/aidlc.ts` and its `aidlc/context.ts`, `stage.ts`, and
  `sensors.ts` helpers. Universal deterministic actions live only in
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
  `{ "finalGate": "<command>" }`; `bun run test` is the fallback. Invoke
  `scripts/aidlc/gate.ts run <absolute-project-root>` and record its receipt.
  Pass means exit zero; failure is failure regardless of whether it is cosmetic.
- After 3.6, there is no Closure stage. `knowledge-base` handles persistent
  capture, validation, and any required compression; then retire the intent.
