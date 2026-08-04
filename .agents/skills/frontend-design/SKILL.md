---
name: frontend-design
description: Define or review a user-facing web UI's visual direction, interaction states, responsive behavior, and accessibility. Use when a request creates, redesigns, or visually refreshes a web interface; do not use for ordinary behavior-only changes.
---

# Frontend Design

Use only for user-facing UI design. Start from the approved brief, supplied
references, real content, audience, and the existing design system. State the
screen's primary user job and the intended visual direction before changing
code.

## Design contract

- Reuse the existing design system, components, and visual language unless the
  request explicitly calls for a visual change.
- Define information hierarchy, controls, default/loading/empty/error/success
  states, keyboard behavior, responsive behavior, and accessibility before
  implementation.
- Make deliberate choices about layout, type, color, spacing, and motion that
  support the product and user task; do not substitute a generic aesthetic for
  missing requirements.
- Work in two passes: first define the visual direction, hierarchy, content,
  states, and responsive behavior; then critique that definition against the
  approved brief, real content, keyboard and focus behavior, accessibility,
  reduced motion, and the project's existing visual language. Record any
  correction before handoff.
- Do not apply landing-page aesthetics to dashboards, data tables, or product
  forms by default.
- Do not use MCP, browser extensions, or a fresh remote-guideline fetch.

## Handoff boundaries

- When UI copy carries product meaning, invokes help or onboarding, or defines
  an empty/error state, use `/content-writer` to establish and validate the
  content contract. Do not invent final copy in the implementation handoff.
- When the implementation target is React or React Native, hand the accepted UI
  definition and finalized content to `/react`. `/frontend-design` owns the
  design decision; `/react` owns component, state, effect, platform, and test
  implementation. Do not duplicate implementation rules here.

## Review output

Return a concise UI definition that maps each visual or interaction decision to
an acceptance criterion and an observable browser proof. Use
`playwright-test-generator` for retained browser tests after the design is
approved; this skill does not generate tests or modify project dependencies.
