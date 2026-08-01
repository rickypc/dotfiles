# Intent-evidence sensor contract

## Applies to

Every selected stage. The executable check is
`utils/aidlc/sensors.ts`; this prompt tells the assistant what evidence must
mean before it calls `complete` or `skip`.

## Pass condition

The active stage ledger record has nonblank, factual evidence. Completion
evidence identifies the work performed and the conclusion reached. Skip
evidence identifies the actual inapplicability condition; “not needed” alone
is insufficient.

## Evidence quality

Name the user instruction, project instruction, codebase-memory finding,
knowledge-base context, file/symbol, decision, or validation result that
supports the conclusion. Mark inference and uncertainty. Do not paste private
KB content, manufacture a source, or use a future-stage result as evidence.

## On failure

Return to the current stage, obtain or record the missing factual evidence,
then run the sensor again. A missing record never authorizes direct edits to
gray-matter frontmatter or a silent advance.
