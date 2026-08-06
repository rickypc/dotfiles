# AIDX evidence-check map

The `sensors` folder name is retained for compatibility. These are compact
evidence checks used by the interaction and state helper; they do not create
additional states. Each check operationalizes a [protocol](../../protocols/index.md)
but does not replace it.

- [approval.md](approval.md) — plan is decision-ready and explicitly approved.
- [context.md](context.md) — required repository and durable-context facts are
  resolved or recorded as unknowns.
- [evidence.md](evidence.md) — current state has factual completion or skip
  evidence.
- [validation.md](validation.md) — acceptance proof and final validation are
  present and successful.

The relationship is deliberate: protocols explain what must be true and who
has authority; checks explain how the current record demonstrates it.
