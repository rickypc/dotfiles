---
name: skill-manager
description: Create or improve one agent skill through an evidence-gated, batched workflow.
---

# Skill Manager

Use for one requested skill creation, rename, review, or behavior change.
`evidence-gated-workflow-controller` owns the state and evidence; this skill
owns only the skill-specific matrix and candidate work.

Apply `aidlc/knowledge/shared/command-catalog.md`. Matrix JSONL artifacts are
temporary inputs and must use the operating system temporary directory.

## Command catalog

| Priority | When | Command | Result | Next |
| --- | --- | --- | --- | --- |
| 1 | One selected skill needs a baseline, targeted candidate repair, or challenge evaluation. | `bun <agents-root>/scripts/skill-manager.ts evaluate "<baseline-or-candidate-or-challenge>" "<absolute-matrix-jsonl-path>" "<absolute-skill-file-path>"` | One evaluation receipt for the selected skill. | Apply only the returned repair packet. |
| 2 | Two independent skills need baseline evaluation. | `bun <agents-root>/scripts/skill-manager.ts batch "<intent-id>" "baseline" "<absolute-first-matrix-jsonl-path>" "<absolute-first-skill-file-path>" "<absolute-second-matrix-jsonl-path>" "<absolute-second-skill-file-path>"` | Concurrent baseline receipts in one result. | Complete compatible repairs as one candidate batch. |
| 3 | Two independent skills need candidate evaluation. | `bun <agents-root>/scripts/skill-manager.ts batch "<intent-id>" "candidate" "<absolute-first-matrix-jsonl-path>" "<absolute-first-skill-file-path>" "<absolute-second-matrix-jsonl-path>" "<absolute-second-skill-file-path>"` | Concurrent candidate receipts and challenge results after every candidate passes. | Apply only returned targeted repair packets. |
| 4 | A script-produced packet requests a draft or repair handoff. | `bun <agents-root>/scripts/skill-manager.ts packet "<intent-id>" "<candidate-checked-or-candidate-requested-or-draft>" "<absolute-skill-path>"` | One state-derived action packet. | Follow that packet; do not invent an assertion result. |

1. Resume or prepare the one matching intent before any edit.
2. Define a non-filler matrix. Every case needs typed assertions, failure mode,
   repair boundary, and an independent verifier. Freeze it before baseline.
3. For two independent skills, use Priority 2. It reads and evaluates both
   pairs concurrently in one response. For one skill or a targeted failed
   repair, use Priority 1 or Priority 4; those commands are not dead code.
4. Complete every compatible action group in one minimal candidate batch. Do
   not alter the frozen matrix, skip an action ID, expand scope, or claim pass.
5. For two independent candidates, use Priority 3. It evaluates both
   candidates concurrently, runs challenges only after every candidate passes,
   and returns targeted repair packets when a candidate or challenge fails. The
   controller accepts only this script-produced receipt. For one selected skill,
   use Priority 1.

Ask all unresolved material questions together when the packet permits no safe
candidate batch. Never invent a score, provider, credential, or evidence. A
challenge result is not a security boundary; it is simply not issued in the
candidate packet.
