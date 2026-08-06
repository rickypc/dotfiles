# Implementation prompt

Execute the approved plan in order using the smallest compatible change. For
each unit, read the named evidence and change only the approved boundary.
Compare the named proof with the resolved final gate: do not run a covered
test or checker separately. Run proof only when it is outside the gate or is
needed to diagnose a failure, then record actual locations, result, limitation,
and deviation.

Use the specialized skill that owns the language, UI, browser, content, or
skill-package work. Follow its command grammar and validation contract. If
implementation reveals a material scope, architecture, ownership, safety, or
acceptance change, stop and return to plan generation rather than deciding it
silently in code.

## Implementation output contract

Report the current AIDX state, the complete approved change boundary, the exact files changed, the single next command, and the expected receipt. Make all approved edits before invoking the final gate. Do not run a covered focused check first. Invoke one final gate for the complete batch; if it fails, repair all compatible failures together and invoke one final gate for that repair batch. Use `/bun-test-generator` immediately for TypeScript/Bun test work. After validation, always review the original plan; use `/knowledge-base` for a positive durable-lesson disposition, preserve its receipt, and invoke the deterministic AIDX finalizer. A negative disposition must carry its own justification and must not skip the finalizer.
