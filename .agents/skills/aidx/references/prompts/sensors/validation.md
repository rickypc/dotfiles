# Validation evidence check

Governing protocols: [evidence protocol](../../protocols/evidence.md) and [recovery protocol](../../protocols/recovery.md).

Pass only when every approved acceptance item maps to focused proof or an
explicit limitation, and the selected project final gate succeeds. Focused
tests, lint, type checks, coverage, screenshots, and earlier green results may
guide repair but do not replace the final gate.

On failure, keep the goal active, record the exact result, repair the approved
scope, and rerun the same proof. Do not close the goal or capture a lesson from
an unverified success.
