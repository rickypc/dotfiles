---
name: frontend-design
description: Define or review a user-facing web UI's visual direction, interaction states, responsive behavior, and accessibility. Use when a request creates, redesigns, or visually refreshes a web interface; do not use for ordinary behavior-only changes.
---

# Frontend Design

## 1. Role & Scope

This skill owns visual direction and interaction-design definition for a
user-facing web UI. It is selected for creation, redesign, or visual refresh,
not ordinary behavior-only work. Its outcome is a reviewable, approved,
accessible, responsive definition ready for implementation. Implementation
belongs to its framework owner; meaningful product copy belongs to
`/content-writer`. Use only for user-facing UI design.

## 2. Immutable Operational Rules

- Start from the approved brief, real content, supplied references, audience,
  existing design system, current screen patterns, and acceptance criteria.
- Define information hierarchy, default/loading/empty/error/success states,
  keyboard and focus behavior, responsive behavior, accessibility, reduced
  motion, and observable proof before implementation.
- Define keyboard behavior, responsive behavior, and accessibility before
  implementation from the approved brief.
- Ask one question at a time when purpose, constraints, or success criteria are
  unresolved. Do not guess product meaning or hide several decisions in one
  prompt.
- Ask when purpose, constraints, and success criteria are unresolved. Offer
  2-3 different approaches with trade-offs and a recommendation tied to the user
  job and existing visual language. Remove unnecessary features from each.
- Do not hand off until the complete definition is critiqued and has **user
  approval**. If approval changes direction, update the definition and repeat
  the critique.
- Do not apply landing-page aesthetics to dashboards, tables, or forms by
  default. Do not use MCP, browser extensions, or a fresh remote-guideline
  fetch.

Do not use MCP, browser extensions, or a fresh remote-guideline fetch. This
skill does not generate tests or modify project dependencies.
Keyboard behavior, responsive behavior, and accessibility before implementation
remain required by the approved brief.
The required sequence includes keyboard behavior, responsive behavior, and accessibility before implementation.

## 3. Input & Context Schema

- **Required:** UI brief, affected screens/flows, design-system constraints,
  real content, audience/product job, and acceptance criteria.
- **Optional:** Supplied visual references, `/content-writer` handoff,
  implementation-owner constraints, existing pattern inventory, and browser
  proof capability.
- **Context:** Current screen, hierarchy, content contract, interaction states,
  responsive breakpoints, keyboard/focus model, accessibility requirements,
  reduced-motion behavior, and acceptance-to-proof mapping.
- **Unknowns:** Missing purpose, constraints, success criteria, content meaning,
  or approval is an explicit stop. Ask the smallest question that resolves it.

## 4. Ordered Execution Chain

1. **Intake:** Inspect the current screen, relevant project context, existing
   components/patterns, real content, audience, brief, design system, and
   acceptance boundary. Split independent screens into approved design slices.
2. **Direction:** State the screen's primary user job, propose 2-3 approaches,
   compare trade-offs, and recommend one. Tie every chosen direction to the
   brief, constraints, visual language, and user job.
3. **Definition:** Specify layout, type, color, spacing, hierarchy, copy,
   controls, loading/empty/error/success states, keyboard/focus behavior,
   responsive behavior, accessibility, reduced motion, and browser-observable
   proof. Use `/content-writer` for product-meaningful copy.
4. **Critique:** present the design in reviewable sections scaled to its
   complexity; map each decision to an acceptance criterion and observable
   browser proof. Critique content, accessibility, responsive behavior,
   keyboard/focus behavior, motion, and existing visual language.
5. **Approve and hand off:** Record corrections, obtain approval, revise and
   re-critique if needed, then hand the accepted definition to `/react` for
   React/React Native implementation or the named implementation owner.

### Ownership handoff table

The retained browser owner is `playwright-test-generator`.

| Concern | Owner | Handoff condition |
| --- | --- | --- |
| Visual direction, hierarchy, states, responsive/accessibility definition | `/frontend-design` | Complete definition is critiqued and approved. |
| Product-meaningful UI copy, help, onboarding, empty/error wording | `/content-writer` | Content contract is researched/validated before implementation handoff. |
| React or React Native component/state/effect/platform implementation | `/react` | Accepted design and finalized content are supplied. |
| Retained browser regression tests | `/playwright-test-generator` | Design is approved and user-facing criteria need project-local coverage. |

## 5. Output & Completion Contract

Success returns an accepted visual direction, hierarchy, real-content contract,
interaction/state inventory, responsive and accessibility behavior, reduced-
motion behavior, acceptance mapping, critique corrections, and observable
browser proof boundary. The approval receipt plus the recorded critique prove
the design is ready; attractive prose alone does not.

Failure names the unresolved product decision, missing content/design-system
constraint, failed acceptance criterion, or absent approval. Do not substitute
a generic aesthetic, hand off an unapproved definition, or modify code from
this skill.

## 6. Evaluation Anchors

- **Canonical:** Two or three directions are compared, one is recommended
  against the brief, and a complete definition maps states and decisions to
  acceptance criteria.
- **Boundary:** Behavior-only work, missing real content, missing accessibility
  state, unresolved purpose, or unapproved definition cannot be handed off.
- **Challenge:** The design must be presented with each decision tied to an
  **acceptance criterion** and **observable browser proof**, then wait for
  **user approval** before implementation.
- **Independent verifier:** Acceptance mapping, critique record, approval
  receipt, and browser-proof boundary independently verify completion.
