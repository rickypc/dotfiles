# Validation prompt

Map acceptance criteria to proof and compare each proposed check with the
project’s appropriate final gate. If the gate already runs a mapped test,
lint, type, coverage, or checker command, do not run that command separately;
record the proof as covered by the gate. Run only non-overlapping checks or a
diagnostic check needed to narrow a failure, then execute the final gate once.
Distinguish development evidence from final-gate evidence and report every
unmapped criterion, limitation, flaky result, and unsupported claim.

On failure, record the exact command, relevant output, diagnosis, and affected
plan unit. Repair only the approved boundary. Do not rerun a failed focused
proof when the same work will be executed by the final gate; use a separate
diagnostic only when it narrows the failure. Then repeat the final gate once.
Do not weaken the plan or substitute a green check for an unmapped acceptance
item.

After successful validation, always review the original active plan for one or
two dense, verified, reusable lessons. Materialize one explicit disposition.
For a positive disposition, use `/knowledge-base` and preserve its successful
receipt path before invoking the deterministic AIDX finalizer. For
`no-durable-lesson`, require a non-empty factual justification and omit the
delegated receipt path. The finalizer must remove the active plan before the
closeout transition; a failed branch must leave the plan intact.
