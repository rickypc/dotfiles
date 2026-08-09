---
name: playwright-test-generator
description: Generate and retain project-local Playwright browser regression tests from accepted user-facing web criteria. Use when a web UI, browser workflow, responsive layout, or explicitly budgeted browser-performance behavior needs durable automated coverage.
argument-hint: "<criteria> <project-root> <playwright-runner>"
---

# Playwright Test Generator

## 1. Role & Scope

This skill owns project-local Playwright acceptance-test generation and
retention. **Use only for user-facing web acceptance criteria.** It converts
accepted criteria into durable browser regression coverage inside the selected
project. It does not install global dependencies, replace unit tests, or claim
acceptance from static checks.

## 2. Usage

```text
/playwright-test-generator <criteria> <project-root> <playwright-runner> # retain browser regression coverage
```

The unannotated grammar is:

```text
/playwright-test-generator <criteria> <project-root> <playwright-runner>
```

Required: accepted user-facing criteria, selected project root, and the
project-declared Playwright runner. Use only for durable browser regression
coverage.

## 3. Immutable Operational Rules

- Use the selected project's declared runner, browser projects, start command,
  test location, dependencies, artifact policy, and single configured final
  gate. Never invent a fallback command.
- The acceptance checklist is the coverage boundary. Describe each criterion
  in **condition, action, and outcome language** and retain **one retained
  project regression test for every criterion** not already covered exactly.
- Exercise the real flow and assert user-visible behavior, states, recovery,
  and controlled side effects. A click, page load, HTTP 200, screenshot, or
  source-text match alone is not acceptance evidence.
- Preserve configured browser projects. A browser launch failure is an
  environment handoff, not an application failure; do not weaken a test or
  claim acceptance from static or HTTP checks.
- Generate performance coverage only from an approved **project-owned
  measurable budget** and controlled measurement conditions. **Do not claim a
  Core Web Vitals pass** from a local timing or trace result; do not invent a
  budget or threshold.

## 4. Input & Context Schema

- **Required:** Accepted user-facing criteria, selected project root, and the
  project-declared Playwright runner.
- **Optional:** Browser project, required viewport, responsive/performance
  budget, existing related tests, trace/screenshot option, and project test
  data helpers.
- **Context:** Manifest/configuration, local `@playwright/test`, test directory,
  start command, configured browser projects, artifact policy, acceptance
  checklist, and existing retained coverage.
- **Unknowns:** Missing project-local runner/dependency, browser launch,
  project command, accepted criterion, or final-gate coverage blocks generation
  or closure. Do not install or modify a global dependency.

The selected project must declare project-local @playwright/test. Every
accepted criterion receives one retained project regression test for every
criterion not already covered. A performance branch requires a project-owned
measurable budget; do not claim a Core Web Vitals pass from uncontrolled
evidence. Invalid input must have a visible rejection path.
Retain one retained project regression test for every criterion.
The approved performance branch uses a project-owned measurable budget.
Do not claim a Core Web Vitals pass from uncontrolled evidence.
Every invalid input has a visible rejection and recovery path.

## 5. Ordered Execution Chain

```text
accepted criteria -> project/runner discovery -> coverage matrix -> real flow
                   -> retained tests -> focused command and final gate
```

1. **Intake:** Resolve the project root and read its manifest/configuration,
   runner, test path, start command, browser projects, existing tests, and
   artifact policy. Confirm project-local `@playwright/test`; if absent, stop.
2. **Matrix:** List each accepted criterion with condition, action, observable
   outcome, target viewport where material, negative/recovery paths, and the
   existing exact covering test. Reject ambiguous or happy-path-only criteria.
3. **Flow:** Run the real flow with the project runner to discover semantic
   locators, states, and outcomes. Generate or update one retained project test
   for each uncovered criterion in the established location.
4. **Assert:** Prefer semantic locators and visible assertions. For invalid
   input, assert the visible error/recovery and **no write request**. For valid
   controlled writes, assert **successful write feedback**, call count, and
   controlled side effects. Isolate contexts and project test data.
5. **Verify and hand off:** Run the focused project command, ensure the
   **single configured final gate executes that test**, inspect traces/screenshots,
   run the mutation check, and return the result. On browser launch failure,
   request the complete project command output from the user.

### Project command table

Read the project manifest/configuration before using any command. Placeholders
below are values declared by that project.

| When | Required inputs | Project action | Result and next action |
| --- | --- | --- | --- |
| Discover ownership | `<project-root>` | Read manifest and Playwright configuration. | Confirm runner, test path, start path, browser projects, and artifacts. |
| Run retained flow | `<project-playwright-test-command>`, `<test-path>` | `<project-playwright-test-command> <test-path>` | Focused proof for one accepted flow; map it to the criterion. |
| Run configured browser | Command, test path, `<configured-browser>` | `<project-playwright-test-command> <test-path> --project <configured-browser>` | Browser-specific proof only for a configured project. |
| Collect diagnostic trace | Command, test path, `<project-trace-option>` | `<project-playwright-test-command> <test-path> <project-trace-option>` | Project-owned debug artifact, not a final gate; repair then rerun. |

### Browser and environment handoff

Use the project's declared browser projects. If Chromium is unavailable or
undesirable in this environment, prefer Firefox for the default run only when
the project supports it; keep Chromium/WebKit opt-in projects intact. Report
the selected browser as an environment preference, not a product failure. A
browser-specific command may use `--project`; use the project-local `.agents`
boundary and hand unit-test changes to `bun-test-generator`.

If a browser cannot launch because of policy, sandbox permission, missing
executable, or process abort, ask the user to run the declared browser command
and paste the complete output including the launch error or assertion. If the
browser launches and the result reports a wrong route/title/content, treat that
as application evidence and diagnose it normally.

### Test integrity and performance

Before writing a test, name the **user-visible break** it catches and derive
expected outcomes from the accepted criterion, not implementation or source
text. Exercise the **real flow**, control network/write/auth/clock boundaries,
and mentally mutate route, branch, validation, visible result, and side effect.
The **mutation check** must catch each realistic mutation or leave the gap
open. Use required viewports for responsive assertions and only stable project-
owned visual baselines. Performance is a separate branch that requires the
approved project-owned budget and controlled conditions.

## 6. Output & Completion Contract

Success returns retained project-local tests, criterion-to-test mapping,
selected browser result, controlled-boundary assertions, traces/screenshots as
applicable, mutation result, and final-gate receipt. The configured project
command executing the real flow is the proof.

Failure names the missing project owner, dependency, criterion, application
assertion, environment launch blocker, controlled-side-effect gap, or final
gate omission. Do not create exploratory-only tests, weaken assertions, add a
second gate, or alter global/project dependencies outside the request.

## 7. Evaluation Anchors

- **Canonical:** One accepted criterion maps to one observable retained browser
  regression test with real-flow and user-visible assertions.
- **Boundary:** A missing runner, browser launch, accepted criterion, or
  project-owned budget stops the relevant branch without a substitute.
- **Challenge:** Invalid input proves visible rejection and **no write request**;
  valid input proves **successful write feedback**; performance evidence does
  not claim a Core Web Vitals pass.
- **Independent verifier:** Project test output, criterion mapping,
  traces/screenshots, controlled-side-effect assertions, mutation checks, and
  the single final gate verify acceptance.
