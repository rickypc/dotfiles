# Universal verification and traceability

## What must trace

For every material change, keep a compact chain:

`goal → requirement/constraint → design or implementation unit → changed code → validation evidence`

A link may be a source path, requirement ID, decision, or explicit skip reason.
The goal is to detect orphaned changes, unsupported requirements, and tests
that do not validate the requested behavior.

## Boundary checks

- **Context to plan:** scope, feasibility, and acceptance criteria agree;
  unresolved assumptions remain labelled.
- **Plan to implementation:** requirements are implementable, design choices
  address constraints, and units identify dependencies and tests.
- **Implementation closeout:** changed units map to the approved boundary,
  recorded deviations are explained, and the project final gate passes.

## Final-gate rule

The gate is the repository's configured final validation command, or
`bun run test` when the repository has no configured gate. It executes the gate.
Lint, type checks, focused tests, coverage, visual checks, and a prior green run
can provide development evidence, but none can substitute for the final receipt:

~~~text
final gate: <command> passed (exit 0)
~~~

A nonzero result is a failure, including cosmetic failures. Repair the approved
scope and rerun the same command. After the receipt, record whether an observed
durable lesson warrants capture; do not claim a lesson from a green command
alone.
