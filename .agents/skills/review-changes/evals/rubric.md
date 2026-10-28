---

schemaVersion: 1
requiredCaseFields: [id, visibility, scenario, assertions, failureMode, repairBoundary, independentVerifier]
requiredVisibility: [candidate, challenge]
minimumPassRate: 1
verifierIds: [source-structure]
---

# Review Evaluation Rubric

The matrix checks the generic review contract: no changes, an isolated child session, a precise
expected-behavior question when requirements are absent, the runtime-selected active root even when
it is the home directory, tracked plus non-ignored untracked changes, the distinction between change
inventory and requirements, `git diff`-only collection including the normal status 1 for a non-empty
`--no-index` diff, language-specific guidance, existing-code reuse, minimum complexity, clear names,
neutral alphabetical ordering, separate review lenses, static inspection, and evidence-backed
findings. It also checks that the skill states its project-neutral boundary and contains no
hardcoded source URLs or repository links.

Package neutrality is a hard gate: inspect every package asset, including cases, rubrics, and
trigger queries, for named organizations, products, projects, fixed repository inventories, or
source-specific links. Reject such content even if `SKILL.md` itself remains generic; keep those
constraints in their owning project skill.

Completeness is a hard gate. The child returns a coverage ledger with one row for every changed file
and hunk, every requirement mapped, every relevant quality dimension marked reviewed with the code,
requirement, or standard inspected (or not applicable with a reason), cross-file interactions
covered, and findings linked to changed lines.
The parent checks that ledger against the complete diff, independently reviews every row, and runs a
whole-diff omission sweep. Finding count never ends the review: there is no top-N cap, no early
stop, and all supported findings across every applicable category go into one consolidated report.
No progress findings or later addenda are sent. Completion requires every coverage entry checked and
a full omission sweep that adds no new supported finding; unsupported concerns are excluded.

Candidate and challenge cases share the same frozen matrix. Missing requirements block review until
the user supplies expected behavior or identifies a readable requirements source. The question names
that exact need; it does not ask for a folder already selected by runtime or confuse a file
list/status excerpt with requirements. There is no code-quality-only fallback. Structural matrix
receipts verify the written protocol; they do not prove a live review completed its ledger or found
every issue, so clean-context forward outputs require separate manual coverage grading where the
runtime supports it.
