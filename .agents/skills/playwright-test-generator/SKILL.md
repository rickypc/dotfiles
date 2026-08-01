---
name: playwright-test-generator
description: Generate and retain project-local Playwright browser regression tests from accepted user-facing web criteria. Use when a web UI, browser workflow, responsive layout, or explicitly budgeted browser-performance behavior needs durable automated coverage.
---

# Playwright Test Generator

Use only for user-facing web acceptance criteria. The intent acceptance
checklist is the coverage boundary; describe each criterion in plain observable
condition, action, and outcome language. Do not use Gherkin.

## Prerequisites

1. Resolve the selected project root and inspect its declared test runner,
   Playwright configuration, test directory, start command, browser artifacts,
   and existing related tests.
2. Confirm the project declares project-local @playwright/test and a runner
   that can execute the relevant browser test. If either is absent, report the
   exact missing project requirement and stop; do not generate a substitute
   test.
3. Do not install or modify a global dependency. Do not use MCP or browser
   extensions. Do not fetch packages implicitly.

## Project command table

Read the selected project's manifest and Playwright configuration before using
any command. Each placeholder below is a value declared by that project; do not
invent a fallback command or run an installation command.
Apply `aidlc/knowledge/shared/command-catalog.md`; this table is ordered from
the normal flow to diagnostic work.

| Priority | When | Required inputs | Project command | Result | Next |
| --- | --- | --- | --- | --- | --- |
| 1 | Discover test ownership. | `<project-root>` | Read the project manifest and Playwright configuration. | Declared runner, test path, start path, and artifact policy. | Map accepted criteria before generating coverage. |
| 2 | Run retained flow coverage. | `<project-playwright-test-command>`, `<test-path>` | `<project-playwright-test-command> <test-path>` | Focused proof for one accepted flow. | Map the result to the acceptance criterion. |
| 3 | Run a configured browser. | `<project-playwright-test-command>`, `<test-path>`, `<configured-browser>` | `<project-playwright-test-command> <test-path> --project <configured-browser>` | Browser-specific proof only when the project config defines that browser. | Report the configured-browser result. |
| 4 | Collect a configured diagnostic trace. | `<project-playwright-test-command>`, `<test-path>`, `<project-trace-option>` | `<project-playwright-test-command> <test-path> <project-trace-option>` | Project-owned failure/debug artifact; not a final gate. | Repair the failed accepted behavior, then rerun the retained flow. |

## Acceptance-to-test workflow

1. Every accepted UI or web acceptance criterion must be listed with its condition,
   action, observable outcome, target viewport when material, and existing
   covering test if one exists.
2. Exercise the real flow with the project-local runner. Use the observation
   only to discover semantic locators, states, and expected outcomes.
3. Generate or update one retained project regression test for every criterion
   not already covered by an exact retained test. Keep the generated test in the
   project's established Playwright location; never discard it as an
   exploratory artifact.
4. Prefer semantic locators and user-visible assertions. Isolate browser
   contexts and project-controlled test data. Preserve existing test helpers
   and conventions.
5. Run the focused project command, retain the test and its mapping, and ensure
   the single configured final gate executes that test. If it does not, leave
   the acceptance criterion open; do not create a second gate.

## Layout, traces, and screenshots

Use required viewport sizes to assert responsive behavior. Capture screenshots
or traces as project-owned debugging evidence. Add snapshot assertions only
when the project already owns stable visual baselines; otherwise test observable
layout and interaction behavior rather than committing brittle image output.

## Performance branch

Generate browser performance coverage only when the approved intent supplies a
project-owned measurable budget and controlled measurement conditions. A
project-local Playwright test may capture browser timing, network observations,
or a trace for that flow. Do not claim a Core Web Vitals pass from that evidence
and do not invent a budget or threshold.

## Boundaries

This skill creates project tests only. It does not alter `.agents`, choose a
project framework, replace `bun-test-generator` unit coverage, or run a global
test command.
