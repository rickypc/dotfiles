# Universal runtime protocol

This is a machine-wide runtime for projects without a project-local AIDLC. It
has no upstream runtime dependency, `tools/` directory, global hooks, Operation
phase, Closure phase, or assistant-native agent requirement.

## Authority order

1. User request and project-local AIDLC, when present.
2. `utils/aidlc/stages.ts` for selected route, conditions, and packet assets.
3. Validated gray-matter intent frontmatter and stage ledger for lifecycle state.
4. `utils/aidlc/command-contract.ts` for public command grammar and returned
   lifecycle actions.
5. This protocol for runtime protection; stage prompts for current work quality.

## Protected assets

During ordinary workflow execution, the only writable AIDLC path is:

```text
<agents-root>/aidlc/<validated-cbm-index>/intents/<intent-id>.md
```

The intent is read and written only through the lifecycle runtime. The
conductor, knowledge, prompts, protocols, roles, scripts, utils, skills,
adapters, and global instructions are read-only runtime infrastructure. A
runtime edit needs an explicit user request naming the asset and its own
verification; it is never stage evidence. The validator rejects non-canonical
intent paths, but filesystem permissions remain the technical safeguard for an
untrusted assistant.

## Universal adaptations

- `start` uses the selected current workspace and accepts only an explicit CBM
  indexed-root match. Nested indexed roots remain independent projects.
- Reverse Engineering uses `/codebase-memory`; durable context and closeout use
  `/knowledge-base`. Neither may be bypassed by independent discovery or local
  reference paths.
- Refined Mockups is the sole UI-definition stage and is active only for UI
  work. Unselected upstream stages never become hidden prerequisites.
- Build and Test executes one project-owned `finalGate` from
  `<project-root>/aidlc.config.json`, falling back to `bun run test`. Its
  runtime receipt is the only 3.6 success evidence; non-zero is failure.
- A known KB disposition uses the atomic closeout action. A disposition learned
  after a bare pass uses the returned recovery action. There is no separate
  Closure phase.
