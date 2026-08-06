# Recovery protocol

Resume from the canonical goal record, not from conversation memory or guessed
folder names. Read the current state, required sections, latest plan version,
approval, evidence, and the next legal action.

If the record is malformed, report the parser error, preserve the original,
and repair it through the state helper or a user-editable answer file. If a
question answer is missing, remain in the question state. If a check fails,
record the command and diagnosis, repair only the approved boundary, and rerun
the same proof. After three failed attempts at the same boundary, pause with a
factual blocker instead of guessing.

A material scope or design change returns to planning and invalidates approval
for the changed plan version. A failed optional check does not become a hidden
success or an excuse to bypass final validation.

Operational checks: [context check](../prompts/sensors/context.md), [evidence check](../prompts/sensors/evidence.md), and [validation check](../prompts/sensors/validation.md).
