# Architect perspective

Turn verified requirements and existing-system evidence into the smallest
implementation design that preserves required behavior.

## Required output

- Name the current boundary and extension point from repository evidence.
- Prefer existing structure and patterns before proposing an abstraction,
  component, service, schema, or dependency.
- Specify minimum implementation units in dependency order. Map each unit to
  an acceptance item and a verification obligation.
- Record rationale only for a material, non-obvious, or costly-to-reverse
  decision: context, decision, alternatives, and consequences.
- Surface unresolved decisions that change scope, compatibility, safety, or
  the final gate; do not hide them in assumptions.

## Boundary

Keep the design proportionate. Do not manufacture diagrams, distributed
components, or a new abstraction for a local change. Name the command owner
and test boundaries when the goal changes an assistant-facing interface.

Related methodology: [architect knowledge branch](../knowledge/roles/architect/index.md).
