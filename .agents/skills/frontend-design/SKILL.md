---
name: frontend-design
description: Define or review a user-facing web UI's visual direction, interaction states, responsive behavior, and accessibility. Use when a request creates, redesigns, or visually refreshes a web interface; do not use for ordinary behavior-only changes.
argument-hint: "<ui-brief> <affected-screens> <design-system> <acceptance-criteria>"
---

# Frontend Design

## 1. Role & Scope

This skill owns visual direction and interaction-design definition for a
user-facing web UI. It is selected for creation, redesign, or visual refresh,
not ordinary behavior-only work. Its outcome is a reviewable, approved,
accessible, responsive definition ready for implementation. Implementation
belongs to its framework owner; meaningful product copy belongs to
`/content-writer`. Use only for user-facing UI design.

## 2. Usage

```text
/frontend-design <ui-brief> <affected-screens> <design-system> <acceptance-criteria> # define or review UI direction and states
```

The unannotated grammar is:

```text
/frontend-design <ui-brief> <affected-screens> <design-system> <acceptance-criteria>
```

Required: UI brief, affected screens or flows, design-system constraints, and
acceptance criteria. Use for a new, redesigned, or visually refreshed UI.

## 3. Immutable Operational Rules

- Start from the approved brief, real content, supplied references, audience,
  existing design system, current screen patterns, and acceptance criteria.
- Classify the target before choosing a design route:
  - **Existing rendered target:** inspect the branch that actually renders on
    the target route and treat the observed UI as ground truth; do not infer
    layout from filenames or import names.
  - **New target in an existing codebase:** anchor the definition to a
    representative existing page, shared shell, and reusable components; never
    fabricate a reproduction of a page that does not exist.
  - **New UI without a codebase:** gather product context, audience,
    platform, brand/taste constraints, and references conversationally before
    defining page detail.
- Treat the approved design system as a constraint, not a suggestion. Explore
  hierarchy, composition, density, or layout within its tokens, typography,
  components, and iconography unless the user explicitly approves a system
  change. If no design system exists, define the smallest usable one first.
- Ask only high-signal questions about unresolved constraints and trade-offs;
  do not repeat decisions already established by the brief or supplied
  context.
- Use real brand assets and iconography when they are available and required.
  Surface missing or ambiguous assets as an explicit decision; do not silently
  substitute generic marks, invented icons, or placeholder identity elements.
- Build a reusable design context from the smallest relevant evidence: product
  job, key journeys, current rendered baseline, shared shell and component
  patterns, tokens, typography, motion, real brand assets, and content
  contract. Reuse an existing context source when one exists; if it is absent,
  define only the minimum needed for the target.
- Capture the current baseline before direction selection. A baseline for an
  existing target describes only what is currently rendered; never put
  proposed changes into the baseline. Refresh only stale or affected context.
- During iteration, branch only genuinely different directions that need
  comparison. After a direction is selected, revise that direction in place
  and preserve the accepted rationale; ordinary corrections do not create
  parallel variants.
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

This skill does not generate tests or modify project dependencies. Keyboard
behavior, responsive behavior, and accessibility before implementation remain
required by the approved brief.

## 4. Input & Context Schema

- **Required:** UI brief, affected screens/flows, design-system constraints,
  real content, audience/product job, and acceptance criteria.
- **Optional:** Supplied visual references, `/content-writer` handoff,
  implementation-owner constraints, existing pattern inventory, reusable
  design context or design-system record, and browser proof capability.
- **Context:** Target routing classification, current render evidence for an
  existing target, a representative sibling and shared shell for a new target
  in an existing codebase, or product/brand context for a new UI without a
  codebase; plus hierarchy, content contract, interaction states, responsive
  breakpoints, keyboard/focus model, accessibility requirements, reduced-motion
  behavior, and acceptance-to-proof mapping.
- **Unknowns:** Missing purpose, constraints, success criteria, content meaning,
  approval, or the evidence needed for the selected target route is an explicit
  stop. Ask the smallest question that resolves it; do not invent an existing
  layout or claim fidelity without source evidence.

## 5. Ordered Execution Chain

```text
brief and context -> design direction -> state/accessibility definition
                  -> critique -> user approval -> implementation handoff
```

1. **Intake:** Classify the target as existing rendered UI, a new target in an
   existing codebase, or new UI without a codebase. For existing UI, inspect
   the actual render branch and current states. For a new target, inspect a
   representative sibling, shared shell, and reusable patterns. For a
   no-codebase target, gather the product and brand context needed to define a
   direction. Build or reuse the smallest reusable design context and capture
   the current baseline before selecting a direction. Keep baseline evidence
   descriptive of the current UI only. Split independent screens into approved
   design slices.
2. **Direction:** State the screen's primary user job, propose 2-3 approaches,
   compare trade-offs, and recommend one. Use observed structure as the
   baseline for existing UI; use the closest confirmed sibling and shared
   patterns for a new page. Tie every chosen direction to the brief,
   constraints, visual language, and user job. Branch only genuinely different
   directions that need comparison; once one is selected, revise it in place
   and preserve the accepted rationale.
3. **Definition:** Specify layout, type, color, spacing, hierarchy, copy,
  controls, loading/empty/error/success states, keyboard/focus behavior,
  responsive behavior, accessibility, reduced motion, real asset/icon usage,
  design-system fidelity, and browser-observable proof. Use `/content-writer`
  for product-meaningful copy.
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

## 6. Output & Completion Contract

Success returns an accepted visual direction, baseline and reusable design
context sources, hierarchy, real-content contract, interaction/state inventory,
responsive and accessibility behavior, reduced-motion behavior, acceptance
mapping, critique corrections, iteration rationale, and observable browser
proof boundary. The approval receipt plus the recorded critique prove the
design is ready; attractive prose alone does not.

Failure names the unresolved product decision, missing content/design-system
constraint, failed acceptance criterion, or absent approval. Do not substitute
a generic aesthetic, hand off an unapproved definition, or modify code from
this skill.

## 7. Evaluation Anchors

- **Canonical:** Two or three directions are compared, one is recommended
  against the brief, and a complete definition maps states and decisions to
  acceptance criteria.
- **Grounding:** Existing targets use the actual rendered branch as the
  baseline; new targets use a representative sibling or shared pattern; a
  no-codebase target is defined from explicit product and brand context.
- **Boundary:** Behavior-only work, missing real content, missing accessibility
  state, unresolved purpose, or unapproved definition cannot be handed off.
- **Challenge:** The design must be presented with each decision tied to an
  **acceptance criterion** and **observable browser proof**, then wait for
  **user approval** before implementation.
- **Grounded iteration:** Existing UI starts from a current-only baseline and
  reusable context; genuinely different directions may branch, while feedback
  on the selected direction is revised in place with its rationale preserved.
- **Independent verifier:** Acceptance mapping, critique record, approval
  receipt, and browser-proof boundary independently verify completion.
