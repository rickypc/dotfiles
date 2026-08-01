---
name: skill-manager
description: Create or improve one agent skill through an evidence-gated, batched workflow.
---

# Skill Manager

Use for one requested skill creation, rename, review, or behavior change.
`evidence-gated-workflow-controller` owns the state and evidence; this skill
owns only the skill-specific matrix and candidate work.

1. Resume or prepare the one matching intent before any edit.
2. Define a non-filler matrix. Every case needs typed assertions, failure mode,
   repair boundary, and an independent verifier. Freeze it before baseline.
3. For two or more independent skills, run one `batch <intent-id> baseline`
   command with paired absolute matrix JSONL and `SKILL.md` paths. It reads and
   evaluates every pair concurrently, returning all baseline receipts in one
   response. For one skill or a targeted failed repair, retain `evaluate` and
   `packet`; they are not dead commands.
4. Complete every compatible action group in one minimal candidate batch. Do
   not alter the frozen matrix, skip an action ID, expand scope, or claim pass.
5. Run one `batch <intent-id> candidate` command for two or more independent
   candidates. It evaluates every candidate concurrently, runs challenges only
   after every candidate passes, and returns targeted repair packets when a
   candidate or challenge fails. The controller accepts only this
   script-produced receipt. For one selected skill, use the existing exact
   `evaluate` phase command.

Ask all unresolved material questions together when the packet permits no safe
candidate batch. Never invent a score, provider, credential, or evidence. A
challenge result is not a security boundary; it is simply not issued in the
candidate packet.
