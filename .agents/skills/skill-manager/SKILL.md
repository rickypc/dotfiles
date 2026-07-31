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
3. Run the batched baseline. Treat its JSON action packet as authoritative.
4. Complete every compatible action group in one minimal candidate batch. Do
   not alter the frozen matrix, skip an action ID, expand scope, or claim pass.
5. Run the required evaluation phase once. The controller accepts only its
   script-produced receipt; it may issue one more batch, challenge, reject, or
   block.

Ask all unresolved material questions together when the packet permits no safe
candidate batch. Never invent a score, provider, credential, or evidence. A
challenge result is not a security boundary; it is simply not issued in the
candidate packet.
