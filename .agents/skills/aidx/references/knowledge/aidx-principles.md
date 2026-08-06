# AIDX operating principles

The AIDX lane turns one goal into evidence-backed code changes without turning
every task into a ceremony-heavy project:

`goal → focused context → material questions → approved plan → controlled implementation → validation → durable lesson`

1. **Evidence before inference.** User input, project instructions,
   `/codebase-memory` facts, and `/knowledge-base` context are distinct
   sources.
   During `INSPECT_CONTEXT`, run independent current-code and durable-context
   lookups in parallel, merge both receipts, and preserve their authority
   boundaries.
2. **One resumable record.** The gray-matter goal record owns the user goal,
   evidence, questions, plan, approval, execution, validation, and outcome. It
   is runtime state, not a project artifact or a private-KB replacement.
3. **Adaptive depth.** Read only the specialist guidance that can change this
   goal's design, implementation, safety, or proof. A small change stays small.
4. **One approval boundary.** A plan version is pending, approved, or
   superseded. Any material scope or design change requires a new version and
   approval before editing continues.
5. **Implementation follows decisions.** Requirements, boundaries, affected
   symbols, and proof prevent implementation from guessing intent.
6. **Validation is acceptance-mapped.** Focused checks provide feedback; the
   repository's configured final gate provides the final result. A green check
   does not prove an acceptance item without a mapping.
7. **Durable knowledge is earned.** Capture only a verified, reusable lesson;
   otherwise record `no-durable-lesson` and close the goal.
