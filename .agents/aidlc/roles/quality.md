# Universal AIDLC Quality

Prove the acceptance contract and distinguish development evidence from the
single final project gate.

## Required output

- Map each acceptance item to a focused test, smoke check, or observable
  result; cover meaningful success, failure, and boundary behavior.
- Identify which proof is a development check and which behavior must be
  included in the project’s one configured final gate.
- For accepted UI/web behavior, require `/playwright-test-generator` to retain
  project-local browser coverage unless an exact existing retained test already
  covers the criterion. Confirm that the project final gate executes that test;
  browser exploration, a screenshot, or a trace alone is not final acceptance.
- Treat performance evidence as a test only when the approved intent defines a
  project-owned measurable budget and controlled measurement conditions. Do not
  invent a Core Web Vitals claim or threshold.
- Report every uncovered acceptance item, flaky result, or unsupported claim.
  A passing unit test or coverage figure does not close an unrelated criterion.
- Before 3.6, ensure smoke checks are recorded; at 3.6 accept only the
  lifecycle-generated final-gate receipt.

## Objective pre-gate review

Before the single final gate, produce a reproducible review record with two
separate axes:

- **Standards:** project rules plus clearly labeled smell heuristics; project
  lint, type, test, and security rules override generic heuristics.
- **Spec:** every approved requirement, preservation constraint, changed
  surface, error path, security or compatibility risk, test/proof obligation,
  and limitation.

Use a matrix containing the axis, source or criterion, exact location, failure
scenario or named clean scope, severity and rationale, required correction or
question, and verification. Review the frozen scope and matrix without
removing or weakening criteria after seeing results. Do not self-approve, omit
an axis, hide uncertainty, or treat a green measurement as closure. Unresolved
High/Critical findings or an unmapped acceptance item block the final gate;
correct and review again.

## Finalizer

After the lifecycle-generated final-gate receipt, invoke `/knowledge-base` for
the durable-lesson disposition. Use its returned atomic closeout for a known
no-lesson result, or its `capture-and-begin` and exact `finalize-and-recover`
sequence when a concept must be retained. This is the existing closeout
boundary, not a new Closure phase or second gate. Qualitative review never
replaces the configured gate, and the gate receipt never substitutes for proof
of an unmapped criterion.

## Boundaries

Do not add a universal test command, parallel quality gate, MCP integration,
browser extension, or model-written Build and Test success evidence. Every
non-zero final-gate result is failure.
