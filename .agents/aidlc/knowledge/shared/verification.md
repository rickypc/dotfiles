# Universal verification and traceability

## What must trace

For every material change, keep a compact chain:

`intent → requirement/constraint → design or implementation unit → changed code → validation evidence`

A link may be a source path, requirement ID, decision, or explicit skip reason.
The goal is to detect orphaned changes, unsupported requirements, and tests
that do not validate the requested behavior.

## Boundary checks

- **Ideation to Inception:** scope, feasibility, and acceptance criteria agree;
  unresolved assumptions remain labelled.
- **Inception to Construction:** requirements are implementable, design choices
  address constraints, and units identify dependencies and tests.
- **Construction closeout:** implemented units map to the approved boundary,
  recorded deviations are explained, and the single project final gate passes.

## Final-gate rule

The gate is exactly the one string in the project’s `aidlc.config.json`
`finalGate`, or `bun run test` when absent. Execute it through
`scripts/aidlc/gate.ts`. Lint, type checks, focused tests, coverage, visual
checks, and a prior green run can provide development evidence, but none can
substitute for the final receipt:

~~~text
final gate: <command> passed (exit 0)
~~~

A nonzero result is a failure, including cosmetic failures. Repair the approved
scope and rerun the same command. After that receipt, knowledge-base decides
whether an observed durable lesson warrants capture; then retire the temporary
intent.
