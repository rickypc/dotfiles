# Validation evidence check

Governing protocols: [evidence protocol](../../protocols/evidence.md) and [recovery protocol](../../protocols/recovery.md).

Pass only when every approved acceptance item maps to proof or an explicit
limitation, and the selected project final gate succeeds. If the final gate
already covers a mapped test, lint, type, coverage, or checker command, do not
execute it separately. Non-overlapping checks or diagnostics may guide repair,
but they do not replace the final gate.

On failure, keep the goal active, record the exact result, repair the approved
scope, and run the final gate once after the complete repair. Use a separate
diagnostic only when it narrows the failure and is not already covered by the
gate. Do not close the goal or capture a lesson from an unverified success.
