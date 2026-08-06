---
name: playwright-test-generator
description: Generate and retain project-local Playwright browser regression tests from accepted user-facing web criteria. Use when a web UI, browser workflow, responsive layout, or explicitly budgeted browser-performance behavior needs durable automated coverage.
---

# Playwright Test Generator

Use only for user-facing web acceptance criteria. The goal acceptance
checklist is the coverage boundary; describe each criterion in plain observable
condition, action, and outcome language rather than scenario keyword syntax.

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

## Browser selection and reporting

Use the browser projects declared by the selected project rather than assuming
one browser is universally preferred. When Chromium is unavailable or
undesirable for a project environment, prefer Firefox for the default browser
run. Keep Chromium and WebKit available as explicit project-specific opt-in
browsers when the project config defines them. Report the selected browser as a
project or environment preference, not as a product failure. Run the retained
acceptance test with the selected project browser and report the result
separately from other configured browsers.

If the project exposes a default-browser command, use that command for the
normal gate. Use the configured browser-specific command or `--project`
selection when a user requests another browser; do not remove other configured
projects merely because the current environment prefers Firefox.

### Environment launch handoff

If Playwright cannot launch a browser because of an organization restriction,
sandbox permission, missing executable, or browser process abort, identify this
as a machine or environment launch failure rather than an application failure.
In that handoff, ask the user to run the project-declared browser command and
wait for the user to paste the result. Request the complete output, including
the failing assertion or browser-launch error. If a browser-specific run is
needed, use the configured `--project` command. Do not remove browser projects,
weaken the test, or claim browser acceptance from static or HTTP checks.
For this handoff, use the selected project's declared browser-specific command
or project option; then ask the user to paste the complete result including the
failing assertion or browser-launch error. In the same handoff, preserve other
configured browsers and not imply Chromium is universally unavailable.

If the browser launches and a pasted result reports a wrong title, route, or
content, treat the pasted browser result as valid execution evidence. distinguish
route, server, or application-loading failures from browser-launch failures and
diagnose the observed page result without labeling the browser environment
unavailable. This handoff is specific to the machine or project environment
that cannot launch its browser; it does not change the project's cross-machine
browser configuration.

## Project command table

Read the selected project's manifest and Playwright configuration before using
any command. Each placeholder below is a value declared by that project; do not
invent a fallback command or run an installation command.
This table is ordered from the normal flow to diagnostic work and is owned by
this skill.

| Priority | When | Required inputs | Project command | Result | Next |
| --- | --- | --- | --- | --- | --- |
| 1 | Discover test ownership. | `<project-root>` | Read the project manifest and Playwright configuration. | Declared runner, test path, start path, and artifact policy. | Map accepted criteria before generating coverage. |
| 2 | Run retained flow coverage. | `<project-playwright-test-command>`, `<test-path>` | `<project-playwright-test-command> <test-path>` | Focused proof for one accepted flow. | Map the result to the acceptance criterion. |
| 3 | Run a configured browser. | `<project-playwright-test-command>`, `<test-path>`, `<configured-browser>` | `<project-playwright-test-command> <test-path> --project <configured-browser>` | Browser-specific proof only when the project config defines that browser. | Report the configured-browser result. |
| 4 | Collect a configured diagnostic trace. | `<project-playwright-test-command>`, `<test-path>`, `<project-trace-option>` | `<project-playwright-test-command> <test-path> <project-trace-option>` | Project-owned failure/debug artifact; not a final gate. | Repair the failed accepted behavior, then rerun the retained flow. |

## Acceptance-to-test workflow

1. Every accepted UI or web acceptance criterion must be listed with its condition,
   action, observable outcome, target viewport when material, negative and
   recovery paths, and existing covering test if one exists. For any criterion
   with user input, exercise empty, malformed, null-like, and wrong-format
   control input where meaningful; for networked or navigational criteria,
   include gateway failure and unavailable navigation. Do not treat a browser
   click, an HTTP 200, or a page load alone as acceptance evidence. Reject
   happy-path-only and HTTP status alone evidence.
2. Exercise the real flow with the project-local runner. Use the observation
   only to discover semantic locators, states, and expected outcomes.
3. Generate or update one retained project regression test for every criterion
   not already covered by an exact retained test. Keep the generated test in the
   project's established Playwright location; never discard it as an
   exploratory artifact.
4. Prefer semantic locators and user-visible assertions, including a visible
   error or recovery assertion for every negative path. Isolate browser
   contexts and project-controlled test data. Intercept or otherwise control
   write boundaries and assert that no write request occurs for invalid input;
   assert successful write feedback and call count when a controlled success
   path is covered. Preserve existing test helpers and conventions.
5. Run the focused project command, retain the test and its mapping, and ensure
   the single configured final gate executes that test. If it does not, leave
   the acceptance criterion open; do not create a second gate.

## Layout, traces, and screenshots

Use required viewport sizes to assert responsive behavior. Capture screenshots
or traces as project-owned debugging evidence. Add snapshot assertions only
when the project already owns stable visual baselines; otherwise test observable
layout and interaction behavior rather than committing brittle image output.

## Performance branch

Generate browser performance coverage only when the approved goal supplies a
project-owned measurable budget and controlled measurement conditions. A
project-local Playwright test may capture browser timing, network observations,
or a trace for that flow. Do not claim a Core Web Vitals pass from that evidence
and do not invent a budget or threshold.

## Boundaries

This skill creates project tests only. It does not alter `.agents`, choose a
project framework, replace `bun-test-generator` unit coverage, or run a global
test command.
