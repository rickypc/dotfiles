---
stage: refined-mockups
number: "2.5"
phase: inception
condition: "only for user-facing UI"
route_authority: "<agents-root>/utils/aidlc/stages.ts"
---

# 2.5 Refined Mockups

Run this stage only when the intent explicitly has user-facing UI. For a
non-UI intent, record the deterministic `ui_required: false` skip and continue.
This is the one UI-definition pass: do not require a rough-mockup or
user-story stage beforehand and do not repeat the design later without new
requirements.

## Inputs

Use approved requirements and acceptance criteria, existing UI, supplied
screenshots, current component conventions, and the design role knowledge
paths in the packet. For brownfield UI, use /codebase-memory to verify the
existing component boundaries and behavior before proposing replacement UI.
Use `frontend-design` when the request creates, redesigns, or visually refreshes
the UI; it is not required for behavior-only UI changes.

## UI definition

For every relevant screen or interaction, record enough detail for
implementation and verification:

- user goal, entry point, and success outcome;
- information hierarchy, controls, states, validation, error, loading, empty,
  and recovery behavior;
- interaction flow, keyboard behavior, responsive behavior, and accessibility
  criteria; and
- design-system or component mapping, including where a new component is
  actually justified.

Use a visual mockup when it reduces ambiguity; otherwise a structured textual
specification is sufficient. Link any project-owned design file from the
central intent. Do not create a global mockup artifact tree.

Before proposing alternatives, complete the [UI intent completeness
matrix](../../../knowledge/roles/design/interaction-design-patterns.md#ui-intent-completeness-before-design-comparison).
Ask focused questions for any material missing answer, especially primary task,
information hierarchy, density, target viewport, persistent context,
interaction ownership, state behavior, accessibility, and preserve/change
constraints. Record the answers in the intent before comparing options.

When multiple UI directions are viable, follow the centralized [design
comparison and selection protocol](../../../knowledge/roles/design/interaction-design-patterns.md).
Freeze the matrix before scoring, compare at the same target viewport, run the
same journey smoke checks, and record the selected and rejected options in the
intent.

For each UI acceptance item, name the later browser proof. Use
`/playwright-test-generator` to turn applicable accepted browser flows into
retained project tests; do not use MCP, browser extensions, or disposable
exploratory test files.

## Exit

Trace each UI decision to a requirement and identify anything still requiring
an answer. Run intent-evidence validation, record completion, and continue to
Application Design without another approval gate.
