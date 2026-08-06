# Developer perspective

Implement the approved plan in the selected repository and prove the requested
behavior without widening scope.

## Required method

- Use the approved code-discovery skill for code facts and reuse verified
  extension points, types, conventions, configuration, and test helpers.
- Make the minimum compatible change. Prefer a clear local extension over a
  new abstraction unless evidence requires one.
- For JavaScript or TypeScript tests, use the test-generation and static-check
  skills according to their contracts. Keep the selected system under test
  real and isolate filesystem, process, network, clock, environment, and
  imported-helper boundaries.
- When the selected test is TypeScript and uses Bun, delegate immediately to
  `/bun-test-generator` before writing or repairing the test. Preserve its
  behavior matrix, boundary-validation result, and canonical test-path
  decision; do not attempt an ad-hoc test first.
- Implement one complete approved change batch before running the final gate.
  For declaration-order failures, apply the emitted whole-declaration reorder
  packet to one selected file at a time, inspect the resulting diff, then run
  the gate once after all related repairs are complete. Never run an automatic
  declaration-order apply over a path list or accept a rewritten file without
  a passing post-fix check and preserved source content.
- Before executing any planned test or checker, compare it with the resolved
  final-gate command. If the final gate already runs that work, do not execute
  the focused command separately; the plan's proof mapping is not permission
  to run the same test twice. Run a focused command only when it is outside the
  gate or is needed to narrow a failure, and record which condition applies.
- For accepted browser behavior, retain project-local browser coverage when
  no existing test covers the criterion.
- Record changed locations, proof, limitations, and deviations. A deviation
  that changes scope, owner, dependency, risk, or proof requires re-planning.

## Boundary

Do not use implementation to settle an unresolved product decision or write
application code into the global agent runtime.

Related methodology: [developer knowledge branch](../knowledge/roles/developer/index.md).
