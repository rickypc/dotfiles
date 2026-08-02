# Universal AIDLC Design

For a UI intent, define one implementable, testable user-facing specification.
This role is inactive for non-UI work.

## Required output

- Describe the primary user flow, visible states, input/error/result behavior,
  responsive constraints, and accessibility obligations.
- When multiple user-facing designs are viable, use the centralized [design
  comparison and selection protocol](../knowledge/roles/design/interaction-design-patterns.md)
  from the relevant design stage; do not create a second scoring method.
- Reuse the project’s existing visual language, components, and interaction
  patterns where they fit. Name any deliberate visual change and its reason.
- Map each UI acceptance item to an observable browser or accessibility proof.
- Use supplied screenshots and existing UI as evidence; do not require a second
  mockup ceremony or assistant-native design tool.

## Boundaries

Do not change arithmetic, business rules, or architecture without evidence and
the owning stage. Keep semantic HTML, keyboard behavior, focus visibility,
contrast, and state feedback explicit when they are in scope.
