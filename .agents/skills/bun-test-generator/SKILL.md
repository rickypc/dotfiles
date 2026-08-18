---
name: bun-test-generator
description: Generate or convert quality-focused TypeScript Bun tests for one selected JavaScript or TypeScript SUT.
argument-hint: "<sut-path> <all|method-list|method-range>"
---

# Bun Test Generator

## 1. Role & Scope

This skill owns quality-focused TypeScript Bun test generation and conversion
for one selected JavaScript or TypeScript system under test. It is a mandatory
pre-edit gate for every test addition, conversion, repair, rename, or deletion,
including work initiated by `/aidx`. It retains behavior evidence with the real
SUT and explicit boundary proof; `/playwright-test-generator` owns accepted
browser flows.

For a project-owned SUT, resolve the nearest `package.json` project root and
use exactly `<project-root>/tests/<sut-relative-path-without-extension>.test.ts`.
For a declared globally owned SUT, use its declared canonical source and test
root and record that ownership exception in the matrix. Never copy or symlink
the SUT to satisfy a path convention.

## 2. Usage

```text
/bun-test-generator <sut-path> <all|method-list|method-range> # generate focused tests for the selected SUT scope
```

The unannotated grammar is:

```text
/bun-test-generator <sut-path> <all|method-list|method-range>
```

Required: one selected JavaScript or TypeScript SUT path and one test scope.
Run this skill before editing the selected test surface.

## 3. Immutable Operational Rules

- Keep the selected SUT real. Mock every external boundary before exercising
  it; **Mock every one with `mock()`** and use **`mock.module()` for every
  imported module** other than the selected SUT.
- An external boundary includes imported modules, filesystem, network, clock,
  random, environment, process, timers, console, globals, constructors,
  injected instances, browser capabilities, and other side effects. A live
  boundary, bare console, or SUT mock is a hard failure.
- Freeze a typed behavior matrix and shared-consumer impact map before test
  edits. Each row names behavior, condition/boundary, expected outcome,
  external mock, assertion, failure mode, repair boundary, and an independent
  verifier.
- Test observable behavior and meaningful side effects across relevant
  partitions. Reject existence-only, tautological, mock-only, integration,
  live-boundary, and coverage-filler tests. Negative paths assert the returned
  error/normalized result and absence of unintended side effects.
- Bun module mocks may persist across test files. Before a shared SUT,
  canonical test, or shared mock registration change, inventory direct
  importers, call sites, public command consumers, and every same-process test.
  **If safe isolation is not proven, stop** and ask for the missing boundary
  plan; never mutate the shared harness to make coverage green.
- Focused coverage is diagnostic, never completion proof. After focused tests,
  run the configured full project gate in the same runner context. When the
  project exposes these lanes, run `test:lint`, `test:unit`, and `test:type`
  separately and retain one receipt for each; use the exact configured
  equivalents when names differ. **Every lane must exit 0** with no test
  failures, TypeScript diagnostics, or lint errors before claiming completion.
  A focused green result is never a final handoff.
- Coverage closure must identify the selected SUT files and report 100% of
  the configured function/line metrics (or the project's explicit equivalent)
  for those files. Aggregate coverage alone is insufficient. Retain the
  selected-SUT coverage receipt alongside the full-gate receipts.
- A top-level `mock.module()` or global mock requires same-process full-suite
  proof, not only a focused-file pass. Built-in module mocks are especially
  risky: prefer an injected boundary or the real platform value when possible;
  otherwise preserve unrelated exports, restore mutable globals, and rerun
  the full suite to catch test-ordering contamination.
- Test doubles must remain type-safe under the strict project type check. Use
  complete real shapes and typed stubs, never `any` or suppression comments.
  Do not mutate readonly shared adapters to steer a test; use dependency
  injection or a typed, test-local seam and restore it in a guaranteed cleanup
  path.
- **The skill MUST ALWAYS mock every external dependency used in generated tests**, including temporary file creation, file writes, removals, process spawns, and any OS interaction.
- If a dependency contract cannot be mocked without guessing, stop and ask for
  that contract. A passing test, coverage report, `/biome-tsc-checker`, or
  all-skill validation cannot substitute for this gate.

### Anti-patterns and countermeasures

See [references/lessons-learned.md](references/lessons-learned.md) for documented
patterns that cause hanging or slow tests and their fixes:

- `<pattern:hanging-stdin>` — inject stdin as mockable dependency
- `<pattern:real-timers-in-tests>` — use fake timers with `advanceTimers()`
- `<pattern:unmocked-external-boundaries>` — mock every boundary with `mock()`/`mock.module()`
- `<pattern:missing-afterEach-cleanup>` — clean up timers/streams in `afterEach`
- `<pattern:slow-test-anti-patterns>` — table of slow patterns vs fast alternatives
- `<pattern:mock-module-rule>` — `mock.module()` for all non-SUT imports

## 4. Input & Context Schema

- **Required:** One SUT path and `all`, a method list, or a method range.
- **Optional:** An existing selected Jest test for conversion and the factual
  `shared-suite-integration` scope when the canonical suite requires it.
- **Context:** Project or declared owner, canonical test path, SUT import graph,
  behavior matrix, external-boundary contract, same-process consumers, project
  test command, and static-check owner.
- **Unknowns:** Missing module/global, unresolved canonical test owner, unsafe
  mock isolation, or unknown boundary behavior is a stop—not a reason to leave
  a dependency live.

The default scope is `isolated-unit`. In `shared-suite-integration`, the SUT
and local helpers remain real, local relative modules are not registered with
`mock.module()`, and process/filesystem/network/package/global boundaries still
require explicit mocks. This scope is an explicit preservation decision, not a
bypass.

For a globally owned browser-runtime exception, the canonical test may live at
`<owner-root>/tests/runtime/<sut-name>.test.ts`; **do not copy or symlink** the
SUT. Import `mock` from `bun:test`; never use `spyOn` or a live `mock` boundary.
Use typed `test.each` when partitions share setup, and do not use `any` or
suppression comments. The accepted selector may be `<all>`; the owning command
remains `bun-test-generator.ts`. The exact ownership guard is `do not copy or symlink`
the SUT.

## 5. Ordered Execution Chain

```text
SUT and scope -> impact map -> behavior matrix -> isolated tests
               -> focused checks -> final gate and evidence
```

1. **Intake:** Resolve the SUT owner, nearest package or declared shared root,
   canonical test path, selected methods, import graph, external boundaries,
   shared consumers, and same-process test scope.
2. **Matrix:** Name the production change that should make each test fail,
   freeze meaningful input partitions and expected values independently of the
   SUT, and record every mock plus observable assertion.
3. **Generate or convert:** Generate a typed Bun test at the canonical path or
   convert the selected Jest test. Register every dependency mock before
   dynamically importing the real SUT; do not alter the SUT or project config.
4. **Validate and test:** Run `validate-boundaries` with source strings and the
   exact SUT module specifier, then `/biome-tsc-checker` for the test. Run the
   selected Bun coverage command and relevant focused tests, then run the
   configured full project lanes (`test:lint`, `test:unit`, and `test:type` or
   their exact equivalents) independently in the same runner context. Re-run
   every affected lane after mock or fixture repairs. Perform a mutation check
   for wrong branches, arguments, side effects, defaults, and malformed or
   boundary inputs. Do not close on coverage alone.
5. **Retire or hand off:** Remove a legacy Jest test only after Bun validation
   and every relevant gate passes. Return boundary, isolation, test, or gate
   failures without weakening the matrix.

### Shared-consumer impact and mock isolation

Before modifying a selected SUT, canonical shared test, or shared mock
registration, use `/repo-search` to inventory direct importers, call sites,
public command consumers, and same-process tests. Record consumer, boundary
touched, compatibility risk, and focused proof. Prefer dependency injection,
test-local boundaries, or a separate process. Never assume test-file boundaries
or `mock.restore()` remove a registered module mock.

`/repo-search` owns the repository-memory contract for this impact map and
currently uses the repo-search CLI compatibility backend.

### Shared-suite integration

Use `shared-suite-integration` only when the existing shared Bun process must
exercise a real in-repository helper and the matrix labels it as an
integration-preservation test. External process, filesystem, network, package,
and global boundaries remain mocked. Never use this scope to mock the SUT or
leave an external dependency live.

### Command-contract preflight

Before invoking any generator or delegated checker, read the owner's usage,
parser, and implementation contract. Verify argument count, positional
meanings, source-versus-path transport, exact SUT module specifier, and JSON
schema. Repair a rejected invocation before retrying; never repeat malformed
input.

For boundary validation, `sutSource` and `testSource` are source strings and
`sutModuleSpecifier` is the exact import specifier used by the test:

```bash
bun <agents-root>/scripts/bun-test-generator.ts validate-boundaries '<json-with-sutSource-testSource-and-sutModuleSpecifier>'
```

The validator fails if the SUT specifier is passed to `mock.module()`; only
other module specifiers are mockable. Add `"scope":"shared-suite-integration"`
only when the shared condition is factual.

Verify exact argument count, positional meanings, and source strings while
`sutModuleSpecifier` remains the exact import specifier. Repair a rejected
command before any retry.
The command contract requires exact argument count, positional meanings, source strings while `sutModuleSpecifier` is present, and repair a rejected command before any retry.

The test-integrity contract says: **Name the production change that should make
it fail** before writing the body, execute the **real selected SUT**, and use a
mutation check. Mock responses mirror the **complete real shape**; test-only
cleanup belongs in **test utilities**, not production classes. The exact module
rule remains **`mock.module()` for every imported module** other than the SUT.

Name the production change that should make it fail, then exercise the real
selected SUT and its observable side effects.

## 6. Output & Completion Contract

Success returns the canonical test source, frozen behavior matrix, shared
impact receipt when applicable, boundary-validation receipt, static-check
receipt, focused test/coverage result, separate full-gate receipts for
`test:lint`, `test:unit`, and `test:type` (or exact configured equivalents),
and mutation-check result. The real SUT, explicit mock assertions, independent
expected values, selected-SUT 100% coverage, and every lane exiting 0 establish
proof. No partial receipt, aggregate coverage result, or focused green run can
close the task.

Failure names the unmocked boundary, SUT mock, unsafe shared registration,
missing contract, weak assertion, mutation gap, failed command, or path owner.
Do not change the SUT, test location, configuration, or dependencies to make a
receipt green.

## 7. Evaluation Anchors

- **Canonical:** A selected SUT receives partitioned typed tests, with the real
  implementation exercised and every external boundary mocked and asserted.
- **Boundary:** A live network/global, mocked SUT, unknown dependency contract,
  or unproven shared mock isolation is rejected.
- **Challenge:** A shared suite forces an impact map and same-process proof;
  the candidate must **Reject filler** and keep `mock()`/`mock.module()` at the
  correct boundary.
- **Independent verifier:** Boundary validation, static checks, focused Bun
  tests, coverage/mutation checks, and the project gate independently verify
  the test.

## References

- [lessons-learned.md](references/lessons-learned.md) — Anti-patterns for hanging/slow tests and their fixes
