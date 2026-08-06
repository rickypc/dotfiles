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
- For accepted browser behavior, retain project-local browser coverage when
  no existing test covers the criterion.
- Record changed locations, proof, limitations, and deviations. A deviation
  that changes scope, owner, dependency, risk, or proof requires re-planning.

## Boundary

Do not use implementation to settle an unresolved product decision or write
application code into the global agent runtime.

Related methodology: [developer knowledge branch](../knowledge/roles/developer/index.md).
