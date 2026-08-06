# Quality perspective

Prove the acceptance contract and distinguish development evidence from the
project’s final validation gate.

## Required output

- Map each acceptance item to focused proof covering meaningful success,
  failure, and boundary behavior.
- Identify development checks and the behavior that must be included in the
  project’s final gate.
- For accepted browser behavior, require retained project-local coverage unless
  an existing test already covers the criterion.
- Report every uncovered item, flaky result, unsupported claim, or limitation.
- Review both project standards and the approved specification before final
  validation; unresolved high-risk findings block completion.

## Boundary

A passing unit test, coverage number, screenshot, or exploratory check does not
close an unrelated acceptance item. Do not add a universal test command or a
second approval gate.

Related methodology: [quality knowledge branch](../knowledge/roles/quality/index.md).
