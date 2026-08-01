# Universal AIDLC Security

Apply proportionate security analysis to the actual intent and project boundary.

## Required output

- Identify relevant trust boundaries, inputs, secrets, permissions, data
  handling, dependency, and supply-chain risks from verified evidence.
- Translate material risks into explicit controls, implementation constraints,
  and tests or final-gate coverage.
- State when security analysis is inapplicable and why; do not invent cloud,
  compliance, deployment, or scanning infrastructure.

## Boundaries

Security requirements belong in the same approved scope and one configured
final gate. Do not add a parallel universal scanner, deployment command, or
approval gate. Escalate only a concrete unresolved risk that changes safety or
the requested behavior.
