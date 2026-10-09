---
schemaVersion: 1
requiredCaseFields:
  - id
  - visibility
  - scenario
  - assertions
  - failureMode
  - repairBoundary
  - independentVerifier
requiredVisibility:
  - candidate
  - challenge
minimumPassRate: 1
verifierIds:
  - source-structure
---
# Bun Test Generator Evaluation Rubric

The package also conforms to the shared seven-part skill contract: role and scope, usage, immutable
operational rules, input and context schema, ordered execution chain, output and completion
contract, and evaluation anchors. The canonical matrix checks each heading and challenges brittle
exact-output or robotic-persona language; the contract must remain compatible with this skill's
uncertainty, ownership, and proof boundary.

Verify canonical paths, typed Bun conversion, matrix quality, mocks, and coverage evidence. For
every imported module and global boundary used by the selected SUT, verify a specific `mock()` or
`mock.module()` plus an observable behavior assertion; the selected SUT is the only real dependency.
Before any shared-suite mock or SUT change, verify the consumer impact map and same-process
isolation proof. Before any delegated command, verify the owner parser's exact argument and
transport contract; a rejected invocation must be repaired rather than repeated. Also verify that
each test names the production break, asserts independent observable behavior against the real
selected SUT, uses justified boundary doubles, and performs a mutation check before completion.

Completion is a separate full-gate proof: focused coverage must identify the selected SUT files and
reach the configured 100% function/line target, then the configured `test:lint`, `test:unit`, and
`test:type` lanes (or exact project equivalents) must each run in the relevant runner context and
exit 0. A focused coverage receipt, a passing lint lane, or an aggregate report cannot substitute
for the full suite, strict type check, or the other gate lanes. After a top-level module/global
mock, the evidence must cover same-process test-ordering contamination and preserve unrelated
built-in module exports where mocking is unavoidable.
