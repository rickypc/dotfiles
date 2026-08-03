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

## Boundaries

Do not add a universal test command, parallel quality gate, MCP integration,
browser extension, or model-written Build and Test success evidence. Every
non-zero final-gate result is failure.
