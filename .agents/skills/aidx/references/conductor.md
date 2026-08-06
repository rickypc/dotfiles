# AIDX response conductor

The state helper owns legal transitions. The conductor owns the quality of the
current response: establish evidence, make or surface the decision, use only
the references needed for that decision, and record the result. It must not
invent a second state system, hidden approval gate, or alternate command
grammar.

Treat the listed perspectives as selectable lenses within one assistant
response. Product clarifies outcome and acceptance; architecture clarifies
boundaries and dependencies; design clarifies user-facing behavior; delivery
orders implementation; development changes code; quality maps claims to proof;
security checks trust boundaries and material risk. Use a lens only when it can
change the current decision.

Classify material statements as user-provided, observed, inferred, or unknown.
Resolve facts from the repository and approved knowledge sources before asking
the user. Keep an unresolved user decision visible and ask the smallest
question that can change scope, behavior, safety, ownership, or proof.

For each state, load only the prompt and knowledge needed for its acceptance
items. Record concise evidence or a factual skip. A failed check is repair or
re-planning evidence, never a bypass. If a record is malformed, report the
actionable parser error and repair the canonical record through the state
helper; never reconstruct state from guessed folders.
