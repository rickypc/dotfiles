# AIDX protocol map

Load the smallest protocol needed for the current decision. A protocol states
the invariant, authority, or recovery rule. Its paired [evidence check
contract](../prompts/sensors/index.md) states the observable pass/fail
condition; the executable state helper remains the authority for legal
transitions.

- [runtime.md](runtime.md) — authority order, ownership boundaries, and
  temporary-artifact rules.
- [evidence.md](evidence.md) — facts, inferences, unknowns, questions, and
  completion evidence.
- [approval.md](approval.md) — explicit plan approval and re-plan behavior.
- [recovery.md](recovery.md) — resume, malformed records, failed checks, and
  bounded repair.

| Protocol | Paired check contract |
| --- | --- |
| [runtime.md](runtime.md) | [context check](../prompts/sensors/context.md) |
| [evidence.md](evidence.md) | [evidence check](../prompts/sensors/evidence.md) |
| [approval.md](approval.md) | [approval check](../prompts/sensors/approval.md) |
| [recovery.md](recovery.md) | [validation check](../prompts/sensors/validation.md), with context and evidence checks during resume |
