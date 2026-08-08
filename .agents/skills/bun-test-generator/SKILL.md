---
name: bun-test-generator
description: Generate or convert quality-focused TypeScript Bun tests for one selected JavaScript or TypeScript SUT.
---

# Bun Test Generator

Use for a selected SUT and `<all>`, method list, or method range. For a
project-owned SUT, resolve the nearest `package.json` project root and use
exactly `<project-root>/tests/<sut-relative-path-without-extension>.test.ts`.

This skill is a mandatory pre-edit gate for every JavaScript or TypeScript test
addition, conversion, repair, rename, or deletion, including work initiated by
`/aidx`. The caller must record the generator invocation and returned behavior
matrix before changing the test. A later passing test, coverage report,
`/biome-tsc-checker`, or all-skill validation does not prove that this gate was
run and cannot replace its receipt.

For an explicitly declared globally owned or shared SUT that lives outside the
nearest package root, the declared owner and declared shared test root are
authoritative. The declared test root is the owner's canonical test location
(for example,
`<owner-root>/tests/runtime/<sut-name>.test.ts`) and keep the real SUT at its
canonical source path. Do not copy or symlink the SUT into a project or test
tree merely to satisfy the project-relative convention. Record the ownership
exception in the behavior matrix and keep project-specific acceptance tests
separate from the shared contract suite.

The phrase `do not copy or symlink` is an ownership rule, not a suggestion.

## CRITICAL external-boundary rule

Every generated or converted Bun test MUST mock every external dependency
before exercising the selected SUT. This is mandatory and cannot be waived:

- The selected SUT is sacred: import and execute its real implementation.
  Never pass the selected SUT module, its exported function/class/object, or
  its implementation through `mock.module()`, `mock()`, `spyOn`, or replacement
  injection. Mocking the SUT creates a fake test and is a hard failure.
- Import `mock` from `bun:test` and register `mock.module()` for every SUT
  module import other than the selected SUT itself.
- Replace every filesystem, network, clock, random, environment, process,
  timer, console, global, constructor, and injected side-effect boundary with
  an explicit `mock()` and assert its calls and arguments.
- A bare real dependency, live default console, live global, or unmocked
  module is a hard validation failure, even when the test passes.
- If the dependency cannot be mocked without guessing its contract, stop and
  ask for the missing contract; never bypass validation or leave it live.

## Shared-consumer impact and mock-isolation gate

Before modifying a selected SUT, a canonical shared test, or any shared mock
registration, use `/codebase-memory` to inventory direct importers, call sites,
public command consumers, and every test file loaded by the configured Bun
command. Record a compact impact map: consumer, boundary touched, compatibility
risk, and focused proof. A selected SUT is shared when another test, script, or
runtime module imports it; a test is shared when it runs in the same Bun process
as other files.

Bun module mocks may persist across test files. Never add a top-level
`mock.module()` to a shared suite until every same-process consumer has been
identified and the replacement contract has been checked against each one.
Prefer dependency injection, a test-local boundary, or a separately spawned
test process. Do not assume test-file isolation or `mock.restore()` removes a
registered module. If safe isolation is not proven, stop and ask for the
missing boundary plan; do not mutate the shared harness or SUT to make
coverage green.

When shared production code changes, apply the same impact gate to the SUT:
preserve all identified consumers, add focused regression coverage for each
material risk, and run the relevant shared suite before the final gate. A
coverage-only change must not alter SUT behavior.

This rule is CRITICAL, ALWAYS enforced, and applies to existing test repairs as
well as newly generated tests. If a test mocks the selected SUT, stop and
rewrite it to call the real SUT while mocking only its dependencies.

## Shared-suite integration boundary

The default scope is `isolated-unit`, and the external-boundary rule above is
unchanged for that scope. When a test is intentionally part of an existing
shared Bun process and must exercise a real in-repository helper, declare
`shared-suite-integration` in the boundary-validation request. In that scope:

- the selected SUT and local helpers remain real;
- local relative modules must not be registered with `mock.module()` because
  Bun module mocks can persist across test files in one process;
- process, filesystem, network, package, and global boundaries still require
  explicit mocks; and
- the test must be labeled as an integration-preservation test in its matrix
  and must use the canonical existing suite rather than creating a parallel
  isolated test.

This is an explicit scope decision, not a bypass. Never use it to leave an
external boundary live or to mock the selected SUT.

For accepted user-facing browser flows, use `/playwright-test-generator` instead
of this unit-test skill. It retains project-local browser regression tests;
this skill remains responsible for selected JavaScript or TypeScript SUT units.

For normal new-test work, generate the TypeScript Bun test directly at that
canonical path. Jest conversion is an exception only when an existing selected
Jest test is found; it is not a prerequisite and it never creates a parallel
Jest test. Create a behavior matrix before tests. Each row states selected behavior,
condition/boundary, observable outcome, external mock, and assertion. Exhaust
all relevant branches through meaningful input partitions; for runtime
boundaries, include undefined, null, wrong primitive types, wrong object
shapes, empty values and valid boundaries when those values are meaningful to
the contract. Every negative-path case must assert the returned error or
normalized result and the absence of unintended side effects; a call that is
merely expected to fail is not coverage. Prefer `test.each` when cases share
setup and assertion shape. An external boundary is every SUT module import
(including a relative helper), filesystem, network call, clock, random source,
environment read, process call, timer, console method, global, constructor,
injected instance, or other side effect that is not the selected SUT. Mock
every one with mock(); use mock.module() for every imported module and
register it before dynamically importing the SUT. The selected SUT itself is
the only import that must remain real, and its behavior must be the thing under
test. Record the exact dependency mock and its observable assertion in every
behavior-matrix row, including assertions on call count and arguments. Reject
filler, existence-only, tautological, mock-only, integration, and live-boundary
tests.

For a globally owned browser-runtime SUT, the test harness may evaluate the
canonical JavaScript source in an isolated context, but the source under test
must remain real. Mock its browser document, fetch/network, timer/clock,
console, global capabilities, script injection, and filesystem/source-loading
boundary. A shared test must not silently test a copied surrogate or use a
live browser/network boundary. The matrix must include meaningful valid,
empty, undefined, null, wrong-primitive, wrong-shape, missing-dependency,
failure-recovery, and retry partitions whenever the public contract makes them
relevant; every negative case asserts both the returned error/normalized result
and the absence of unintended side effects.

Mock every external boundary explicitly; mock every one with `mock()` and use
`mock.module()` for every imported module. An isolated harness is not permission
to leave a boundary live. The test must mock every external boundary before it
asserts the selected SUT behavior.

A complete behavior matrix has typed assertions, a failure mode, a repair
boundary, and an independent verifier for every case. The verifier must be
separate from the assertion text—for example, a validator, focused test
command, or observable contract check that can independently reject a weak or
filler case.

Mock every one with `mock()` and use `mock.module()` for every imported module.
Reject filler.

Convert selected Jest tests to typed Bun tests at the canonical path. Inventory
their behavior first, preserve or improve SUT line/function coverage, remove the
legacy Jest test only after Bun validation, then delegate lint/type checking to
`/biome-tsc-checker`.

Use this exact order: resolve the project root or declared shared-test owner;
locate canonical and selected legacy tests; inventory observable contracts,
every external boundary, and shared consumers from the SUT source; freeze the
impact map and behavior matrix;
generate or convert the TypeScript Bun test;
run `validate-boundaries` with the exact SUT and test source; run
`/biome-tsc-checker` for the test; run the selected Bun coverage command; then
remove a legacy Jest test only after every gate passes. If boundary validation
reports a missing module or global mock, add that mock and its behavior
assertion before rerunning; do not bypass it. Never alter a SUT, project
configuration, or test location to make coverage appear green. For a JavaScript
SUT, the generated test remains TypeScript and uses explicit types without
`any` or suppression comments.

## Command-contract preflight

Before invoking `bun-test-generator.ts` or any delegated checker, read the
owning script's usage text, argument parser, and implementation contract. Verify
the exact argument count, positional meanings, whether each value is a path or
source text, the exact SUT module specifier, and whether a JSON payload is
inline text or a temporary file. For `validate-boundaries`, `sutSource` and
`testSource` are source strings while `sutModuleSpecifier` is the exact import
specifier used by the test; do not pass file paths in the source fields.
Materialize rich JSON through the shared TypeScript writer when the owner
requires a request file. Run the owning validator before executing tests and
repair a rejected command before any retry; never infer a contract from a
failed invocation.

```bash
bun <agents-root>/scripts/bun-test-generator.ts validate-boundaries '<json-with-sutSource-testSource-and-sutModuleSpecifier>'
```

The boundary-validation JSON MUST include the exact module specifier used by
the test to import the selected SUT. Validation fails if that specifier is
passed to `mock.module()`; only the other module specifiers are mockable.
It may include `"scope":"shared-suite-integration"` only when the shared
suite condition above is factual; omission defaults to `isolated-unit`.
