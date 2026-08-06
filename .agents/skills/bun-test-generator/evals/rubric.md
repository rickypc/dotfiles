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

Verify canonical paths, typed Bun conversion, matrix quality, mocks, and coverage evidence.
For every imported module and global boundary used by the selected SUT, verify a
specific `mock()` or `mock.module()` plus an observable behavior assertion; the
selected SUT is the only real dependency. Before any shared-suite mock or SUT
change, verify the consumer impact map and same-process isolation proof. Before
any delegated command, verify the owner parser's exact argument and transport
contract; a rejected invocation must be repaired rather than repeated.
