# Approval evidence check

Governing protocol: [approval protocol](../../protocols/approval.md).

Pass only when the current goal record contains a decision-ready plan and an
explicit approval for its current plan version. The valid decisions are
approve, re-plan, and decline.

On failure, keep the goal before implementation and repair the handoff or wait
for the user’s decision. Do not infer approval from task wording or silence.
