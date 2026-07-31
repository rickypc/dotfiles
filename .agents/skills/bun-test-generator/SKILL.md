---
name: bun-test-generator
description: Generate or convert quality-focused TypeScript Bun tests for one selected JavaScript or TypeScript SUT.
---

# Bun Test Generator

Use for a selected SUT and `<all>`, method list, or method range. Resolve the
nearest `package.json` project root and use exactly
`<project-root>/tests/<sut-relative-path-without-extension>.test.ts`.

For normal new-test work, generate the TypeScript Bun test directly at that
canonical path. Jest conversion is an exception only when an existing selected
Jest test is found; it is not a prerequisite and it never creates a parallel
Jest test. Create a behavior matrix before tests. Each row states selected behavior,
condition/boundary, observable outcome, external mock, and assertion. Exhaust
all relevant branches through meaningful input partitions; prefer `test.each`
when cases share setup and assertion shape. An external boundary is every SUT
module import (including a relative helper), filesystem, network call, clock,
random source, environment read, process call, timer, console method, global,
constructor, injected instance, or other side effect that is not the selected
SUT. Mock every one with `mock()`; use `mock.module()` for every imported
module and register it before dynamically importing the SUT. The selected SUT
itself is the only import that must remain real. Record the exact mock and its
observable assertion in every behavior-matrix row. Reject filler,
existence-only, tautological, mock-only, integration, and live-boundary tests.

Convert selected Jest tests to typed Bun tests at the canonical path. Inventory
their behavior first, preserve or improve SUT line/function coverage, remove the
legacy Jest test only after Bun validation, then delegate lint/type checking to
`biome-tsc-checker`.

Use this exact order: resolve project root; locate canonical and selected legacy
tests; inventory observable contracts and every external boundary from the SUT
source; freeze the behavior matrix; generate or convert the TypeScript Bun test;
run `validate-boundaries` with the exact SUT and test source; run
`biome-tsc-checker` for the test; run the selected Bun coverage command; then
remove a legacy Jest test only after every gate passes. If boundary validation
reports a missing module or global mock, add that mock and its behavior
assertion before rerunning; do not bypass it. Never alter a SUT, project
configuration, or test location to make coverage appear green. For a JavaScript
SUT, the generated test remains TypeScript and uses explicit types without
`any` or suppression comments.

```bash
bun ~/.agents/scripts/bun-test-generator.ts validate-boundaries '<json-with-sutSource-and-testSource>'
```
