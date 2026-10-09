---
name: react
description: >-
  Implement and review React and React Native interfaces with shared guidance for state, effects,
  data, accessibility, performance, platform behavior, transitions, and user-visible tests.
argument-hint: <react-or-react-native-scope> <approved-design> <acceptance-criteria>
---

# React

## 1. Role & Scope

Use this skill when the implementation target is React or React Native. It is the single
implementation owner for both platforms and delivers the smallest coherent accessible UI change with
user-visible proof. Use `/frontend-design` first for a new or changed visual direction and
`/content-writer` when meaningful UI copy needs research or validation; this skill consumes those
approved inputs and does not silently change them.

## 2. Usage

```text
/react <react-or-react-native-scope> <approved-design> <acceptance-criteria> # implement and verify an approved React surface
```

The unannotated grammar is:

```text
/react <react-or-react-native-scope> <approved-design> <acceptance-criteria>
```

Required: implementation scope, approved design/content inputs when applicable, and acceptance
criteria. Use `/frontend-design` first for changed visual direction.

## 3. Immutable Operational Rules

- Define the changed user-visible states before implementation: initial, loading, empty, success,
  error, retry, disabled, stale, and interrupted states where they apply. Give each state value one
  clear owner.
- Keep render pure. Derive values during render, use effects to synchronize with external systems,
  and keep subscriptions, timers, requests, and native resources paired with cleanup and
  cancellation.
- Treat asynchronous work as a state machine. Prevent stale responses from overwriting newer intent
  and handle pending, failure, retry, cancellation, stale responses, and repeated submission where
  relevant.
- Treat external data, HTML, URLs, storage, permissions, and authentication as untrusted at the
  boundary. Validate or sanitize before rendering, navigating, persisting, or invoking privileged
  operations.
- Prefer semantic elements and platform accessibility APIs. Provide names, roles, values, labels,
  focus order, visible focus, keyboard/assistive alternatives, non-color feedback, and
  reduced-motion behavior.
- Preserve accepted design/content, public contracts, project conventions, and one state/side-effect
  owner. Stop when approval, platform behavior, or test ownership is unresolved.
- Measure before claiming performance improvement and test user-visible outcomes and important
  failure paths rather than internals alone.

## 4. Input & Context Schema

- **Required:** React or React Native scope, project instructions/conventions, acceptance criteria,
  and the relevant component/data/routing boundary.
- **Optional:** Accepted design, finalized content, browser/device proof, platform constraints,
  transition request, existing tests, and performance budget.
- **Context:** State inventory, public contracts, data-fetch/cache/suspense and error-boundary
  conventions, external sinks, effect lifetime, responsive or native platform behavior, and existing
  test gate.
- **Unknowns:** Missing design/content approval, target platform, state owner, security contract, or
  proof boundary is an explicit stop. Ask or hand off; do not invent product meaning.

## 5. Ordered Execution Chain

```text
approved inputs -> state and boundary model -> smallest implementation
                 -> accessibility/race review -> tests and user-visible proof
```

1. **Intake:** Read project instructions, existing component/data conventions, accepted
   design/content, and acceptance criteria. Use `/repo-search` for repository facts and preserve
   routing, testing, and platform patterns. The caller-facing discovery route and repository-memory
   contract are owned by `/repo-search`, with the current repo-search CLI as the compatibility
   backend.
2. **Model:** Define changed user-visible states, one owner per state value, inputs/boundaries,
   loading/empty/error/retry/cancellation behavior, focus, keyboard, semantic, responsive, or native
   accessibility behavior.
3. **Implement:** Make the smallest coherent change. Keep render pure, state at the narrowest owner,
   effects cancellable, external data guarded, and public contracts stable. Preserve stable
   collection identity and existing project context/routing/data conventions.
4. **Review:** Check races, stale work, unbounded work, unsafe sinks, accessibility regressions,
   platform divergence, performance cost, and browser/device behavior where the project owns that
   proof.
5. **Verify and hand off:** Run the project's focused tests and relevant static/browser/device
   proof. Map results to acceptance criteria and return limitations instead of hiding them.

### Shared implementation rules

Use local state and composition by default; introduce shared state only for a demonstrated shared
consumer. Use stable keys when collections can be inserted, removed, reordered, or filtered. Define
URL/history, focus restoration, form validation, storage, and external links for web. For native,
define navigation, permissions, lifecycle, network loss, persistence, device resources, secure
storage, deep links, touch targets, screen-reader order, virtualized lists, and iOS/Android
divergence where material.

### Optional view transitions

Apply transitions only when explicitly requested or accepted in the design. Audit navigation and
element identity first; preserve semantics and focus, provide a non-transition fallback, respect
reduced motion, and validate interrupted navigation, slow/failed data, back/forward behavior,
unsupported environments, and reduced-motion behavior.

### Testing and evidence

Use the project's existing unit, integration, browser, or device conventions. For
JavaScript/TypeScript test edits, invoke `/bun-test-generator` before editing and retain its
behavior matrix and boundary receipt. For retained user- facing browser coverage, use
`/playwright-test-generator`. A passing test or coverage number is not enough when accessibility,
failure, cancellation, or side-effect behavior lacks observable proof.

## 6. Output & Completion Contract

Success returns coherent changed code, traceable accepted design/content, explicit state ownership,
effect cleanup/cancellation, web/native obligations, security/performance review, and
project-appropriate test proof. Completion is decided by the configured project gate and acceptance
evidence; an internal component snapshot or static check alone is not proof.

Failure names the exact approval, platform, state, security, accessibility, performance, race, test,
or final-gate gap. Do not silently change approved design/content, claim cross-platform behavior
from one platform, or hand off unverified code.

## 7. Evaluation Anchors

- **Canonical:** A component change maps user-visible states to one owner, handles side effects and
  accessibility, and proves behavior through the project's test boundary.
- **Boundary:** Stale async work, unsafe data sinks, missing cancellation, duplicated state
  ownership, absent approval, or missing platform proof stops completion.
- **Challenge:** The implementation must **Treat asynchronous work as a state machine**, **Prefer
  semantic elements and platform accessibility APIs**, and **Test user-visible outcomes** across
  failure and cancellation paths.
- **Independent verifier:** Focused tests, static checks, browser/device proof, acceptance mapping,
  and the project final gate independently verify closure.
