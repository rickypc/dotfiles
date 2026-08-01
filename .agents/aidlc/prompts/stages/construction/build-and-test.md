---
stage: build-and-test
number: "3.6"
phase: construction
condition: "always; one final gate"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 3.6 build and test

## Universal runtime contract

This is the retained upstream stage method adapted to the universal runtime.
The route, applicability, roles, sensors, and current state come only from the
stage packet emitted by `~/.agents/scripts/aidlc.ts`; this document cannot add
prerequisite stages or a separate lifecycle. Work in the selected project and
record evidence, decisions, and project-document links in the central temporary
intent at `~/.agents/aidlc/<cbm-index>/intents/<intent-id>.md`.

Use the role cards as review perspectives in the current assistant. Do not
expect assistant-native orchestration or lifecycle storage. For repository
facts, invoke `codebase-memory`; for persistent knowledge, invoke
`knowledge-base`. At completion, run the packet's sensors
and use `aidlc.ts complete <intent-path> <evidence>` or `skip` with a factual
reason. Only 1.7 waits for approval. At 3.6, invoke
`aidlc.ts complete <intent-path>` with no evidence; it runs exactly the one
configured final gate and returns the result.

This is the mandatory construction closeout. It runs exactly one command: the
project's configured final gate. The command is defined once by the project in
`aidlc.config.json` as `finalGate`; when absent it is `bun run test`. Do
not add a cosmetic, build, lint, type, coverage, or test sub-gate here. The
single configured command is the final gate, and its non-zero exit is failure.

## Procedure

1. Confirm that Code Generation recorded the implementation scope, changed
   files, and relevant tests. Use the quality and security role perspectives
   from the stage packet to review that evidence; do not create a separate
   testing strategy or instruction-file tree.
2. Invoke the lifecycle completion command with no evidence:

   `bun ~/.agents/scripts/aidlc.ts complete <intent-path>`

   It resolves and executes the configured command once, persists the canonical
   receipt on success, and returns the next action. Do not run a separate gate
   helper or supply model-written final-gate evidence.
3. If it returns a failed gate, treat every failure as a real failure. Use its output
   and `codebase-memory` where needed to locate the cause, repair the
   selected project, and rerun the same one gate. Do not replace it with a
   narrower command, waive a cosmetic failure, or proceed on partial success.
4. When it returns a passing gate, run the packet's validation-evidence sensor.
   After 3.6, invoke
   `knowledge-base` for durable capture only when there is a validated,
   reusable lesson; otherwise record that no capture is warranted and retire
   the temporary intent.

## Evidence required

The automatic final record names the absolute project root, the resolved single
command, its exit code, defects repaired during reruns, and the final pass. No
number of preliminary commands can substitute for this receipt.
