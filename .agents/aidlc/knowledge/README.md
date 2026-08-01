# Universal AIDLC knowledge

This directory is committed methodology for the universal runtime. It is not a
private knowledge base and must not contain project facts, customer data,
temporary intent records, secrets, or machine-specific paths.

Persistent private knowledge belongs only to the external `knowledge-base`
root. Machine-local workflow state belongs at `aidlc/<cbm-index>/` and is
ignored. The retained upstream methodology is organized in `shared/` and
`roles/`; `upstream-adoption-matrix.md` explains every adoption,
replacement, and omission. Stage contracts may cite this directory for universal definitions,
but must never refer to upstream `.aidlc`, `spaces`, OpenCode tools, hooks, or
agents that are not part of this runtime.
