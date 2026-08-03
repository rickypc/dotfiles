# Context-snapshot sensor contract

## Applies to

Reverse Engineering (2.1) only. The executable check is
`utils/aidlc/sensors.ts`; normal routes persist validated context atomically
through the canonical AIDLC approval-with-context command row. The separate
`scripts/aidlc/context.ts` command is recovery-only for an already-approved
older intent.

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

Resolve context through the supported script/skill boundary, correct invalid
bindings or contradictions, and rerun the sensor before completing 2.1.
