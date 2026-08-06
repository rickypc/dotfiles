# Evidence protocol

Classify each material claim as one of:

- **User-provided** — stated by the user or supplied in the goal.
- **Observed** — read from an instruction, file, command result, or approved
  discovery result.
- **Inferred** — a reasoned conclusion that names its supporting evidence.
- **Unknown** — not established and still capable of changing the decision.

Resolve available facts before asking the user. Ask one concise batch of
questions whose answers can change scope, behavior, safety, ownership,
architecture, or proof. Every question must have a reason. Record the answer
and the affected plan decision.

Completion evidence names the work performed, location or boundary, observed
result, and limitation. A skip names the actual inapplicability condition;
“not needed” alone is not evidence.

Operational check: [evidence check](../prompts/sensors/evidence.md).
