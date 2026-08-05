# Context-snapshot sensor contract

## Applies to

Reverse Engineering (2.1) only. The executable check is
`utils/aidlc/sensors.ts`. When validated bindings are available before
approval, normal routes persist them atomically through the canonical AIDLC
approval-with-context command row. When they are not available, approval may
persist first; if its receipt returns `resolve-knowledge-context`, execute that
exact returned `scripts/aidlc/context.ts resolve` action once. The standalone
resolver is recovery-only when returned by the runtime, not a guessed
pre-approval step.

The supported `scripts/aidlc/context.ts` boundary owns the context-only update;
do not reproduce it with an ad hoc filesystem edit.

## Pass condition

The current intent records a resolved timestamp, permitted organization/team/
project bindings, ordered rules, and source concept paths from
`/knowledge-base`. The snapshot proves context resolution occurred; it does not
make private-KB content part of the global runtime or grant a filesystem search
path.

## Required behavior

Ask `/knowledge-base` to resolve only concepts material to the selected change.
Use `/codebase-memory` for repository facts. No result is a factual result: note
it and continue with observed project evidence rather than inventing a project
relationship or a knowledge rule.

## On failure

Resolve context through the supported script/skill boundary named by the
returned action, correct invalid bindings or contradictions, and rerun the
sensor before completing 2.1. Preserve the returned arguments exactly.
