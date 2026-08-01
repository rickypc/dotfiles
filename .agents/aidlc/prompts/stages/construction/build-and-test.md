---
stage: build-and-test
number: "3.6"
phase: construction
condition: "always; one final gate"
route_authority: "utils/aidlc/stages.ts"
---

# 3.6 Build and Test

This stage runs exactly one configured final project command. The command and
closeout forms are defined only by `utils/aidlc/command-contract.ts`.

1. Confirm Code Generation recorded changed files and mapped every acceptance
   item to a test, smoke check, or observable result. Run those focused checks
   before this stage and record their outputs.
2. Use the lifecycle final-gate action. It resolves the project configuration
   or `bun run test` default, executes it once, and emits the only valid 3.6
   receipt. Do not call a standalone gate helper or supply model-written gate
   evidence.
3. On failure, repair the reported problem and rerun the same lifecycle action.
   No cosmetic, lint, type, coverage, or test failure is waived or replaced by
   a narrower command.
4. If KB disposition is already known, use the atomic closeout action. If it is
   unknown after a bare pass, ask `knowledge-base` and execute the one returned
   recovery action. Both paths preserve an explicit disposition before retirement.

A passing final gate does not close an acceptance item without its own mapped
proof.
