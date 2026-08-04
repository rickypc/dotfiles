---
name: react
description: Implement and review React and React Native interfaces with shared guidance for state, effects, data, accessibility, performance, platform behavior, transitions, and user-visible tests.
---

# React

Use this skill when the implementation target is React or React Native. It is
the single implementation owner for both platforms. Use
[`/frontend-design`](../frontend-design/SKILL.md) first when the request creates
or changes a user-facing design, and use [`/content-writer`](../content-writer/SKILL.md)
when meaningful UI copy needs research, drafting, or validation. This skill
consumes the accepted design and finalized content; it does not silently change
either one.

## Boundary and workflow

1. Read the project instructions, existing component and data conventions, and
   the accepted UI definition when one exists. Use `/codebase-memory` for
   repository facts and preserve the project's routing, data, testing, and
   platform conventions.
2. Define the changed user-visible states before implementation: initial,
   loading, empty, success, error, retry, disabled, stale, and interrupted
   states where they apply. Include keyboard, focus, semantic, responsive, and
   platform accessibility behavior.
3. Implement the smallest coherent change. Keep state and side effects at the
   narrowest owner, preserve public contracts, and prove the observable result
   with the project's existing test boundary.
4. Review the changed path for race conditions, stale work, unbounded work,
   unsafe data sinks, accessibility regressions, and platform divergence. Use
   browser or device proof when the project owns that capability and the
   acceptance criteria require it.

## Shared React rules

- Keep render logic pure. Derive values during render instead of storing a
  second source of truth. Use effects to synchronize with an external system,
  not to repeat work that belongs in render or an event handler.
- Give each state value one clear owner. Prefer local state and composition;
  introduce shared state only for a demonstrated shared consumer. Preserve the
  project's existing context, routing, data-fetching, cache, suspense, and
  error-boundary conventions.
- Give collections stable identity. Do not use an index as a key when items can
  be inserted, removed, reordered, or filtered. Keep subscriptions, timers,
  requests, and native resources paired with cleanup and cancellation.
- Treat asynchronous work as a state machine. Handle pending, empty, success,
  failure, retry, cancellation, stale responses, and repeated submission where
  they affect the user path. Do not let an older response overwrite newer
  intent.
- Treat external data, HTML, URLs, storage, permissions, and authentication
  state as untrusted at their boundary. Validate or sanitize before rendering,
  navigating, persisting, or invoking a privileged operation.
- Prefer semantic elements and platform accessibility APIs. Provide names,
  roles, values, labels, focus order, visible focus, keyboard or assistive
  alternatives, and non-color feedback. Do not make a gesture or animation the
  only way to complete an action.
- Measure before claiming a performance improvement. Review bundle and asset
  cost, repeated renders, expensive calculations, list or image memory,
  unnecessary network work, layout work, and cancellation. Optimize the named
  user path while preserving correctness and accessibility.
- Test user-visible outcomes and important failure paths rather than component
  internals alone. Match the project's existing unit, integration, browser, or
  device test conventions.

## React for the web

When the target runs in a browser, preserve semantic HTML and progressive
interaction. Define URL and history behavior, focus restoration, form
validation, keyboard operation, responsive layout, loading/empty/error/retry
states, reduced-motion behavior, and safe handling of browser storage and
external links. Use browser proof for critical accepted journeys when the
project has a retained browser test capability.

## React Native

When the target runs on mobile, treat navigation, permissions, app lifecycle,
network loss, local persistence, device resources, and platform divergence as
product behavior. Define iOS and Android differences where they matter. Review
touch targets, screen-reader labels, reading order, virtualized lists, image
and media memory, repeated renders, native-module lifetime, deep links, secure
storage, and release configuration. Use the project's component, device, or
end-to-end proof rather than assuming browser behavior transfers unchanged.

## Optional view transitions

Apply this section only when the user or approved design explicitly requests
spatial transitions. First audit the existing navigation and element identity;
do not add motion merely to decorate a state change. Use the transition
capability supported by the project's React/runtime/browser baseline, preserve
semantic structure and focus, provide a correct non-transition fallback, and
respect reduced-motion preferences. Validate interrupted navigation, slow or
failed data, back/forward behavior, unsupported environments, and the reduced-
motion path before calling the transition complete.

## Handoff checklist

Before returning implementation, confirm:

- the accepted design and content are traceable;
- state ownership and effect cleanup are explicit;
- web or native platform obligations are covered;
- loading, empty, error, retry, accessibility, and interruption behavior are
  observable where relevant;
- security and performance review is tied to a named path; and
- focused tests or smoke checks match the project boundary, with limitations
  recorded instead of hidden.
