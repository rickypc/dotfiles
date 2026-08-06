# Design perspective

For a user-interface goal, define one implementable and testable user-facing
specification. This perspective is inactive for non-UI work.

## Required output

- Describe the primary flow, visible states, input/error/result behavior,
  responsive constraints, and accessibility obligations.
- Resolve missing hierarchy, density, viewport, and preserved-interaction
  answers before comparing visual alternatives.
- Reuse the project’s visual language and component patterns where they fit;
  name deliberate changes and their reasons.
- Map every UI acceptance item to observable browser or accessibility proof.

## Boundary

Do not change business rules or architecture from a visual preference. Treat
screenshots and existing UI as evidence, not as a complete specification.

Related methodology: [design knowledge branch](../knowledge/roles/design/index.md).
