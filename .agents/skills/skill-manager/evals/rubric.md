---
schemaVersion: 1
requiredCaseFields:
  - id
  - visibility
  - scenario
  - assertions
  - failureMode
  - repairBoundary
  - independentVerifier
requiredVisibility:
  - candidate
  - challenge
minimumPassRate: 1
verifierIds:
  - source-structure
---

# Skill Manager Evaluation Rubric

The package also conforms to the shared seven-part skill contract: role and scope, usage, immutable operational rules, input and context schema, ordered execution chain, output and completion contract, and evaluation anchors.
The seven headings are the document architecture, not an additive wrapper: an existing skill must migrate retained content into one owning section or nested subsection, remove superseded blocks, and pass a cohesion review beyond the heading count. The canonical matrix checks this shape and challenges brittle exact-output or robotic-persona language; the contract must remain compatible with this skill's uncertainty, ownership, and proof boundary.

Each case verifies an explicit, independently checkable requirement of the
skill-maintenance workflow. Candidate cases are evaluated before a candidate is
accepted. Challenge cases are not issued in the candidate action packet.

For behavior-changing guidance, the quality record must show RED before the
edit, GREEN after the smallest repair, and REFACTOR after new loopholes are
closed. The matrix fingerprint remains fixed; candidate evidence must have a
changed source fingerprint, and challenge evidence must match the candidate
source and matrix. Pressure evidence uses a no-guidance control, combined
pressures, repeated samples when supported, manual review of flagged outputs,
variance awareness, and captured rationalizations.

The matrix does not decide lint, TypeScript, tests, coverage, resource
integrity, or other deterministic gates. Those remain separate evidence.
No score, measurement, candidate receipt, or challenge receipt alone closes a
skill update; deterministic gates and the owner’s review receipt remain
mandatory.

Agent Skills output evals must also preserve clean with-skill and
without-skill/prior-version comparisons, realistic varied prompts, at least
one boundary case, assertion-level evidence, deterministic checks for
mechanical assertions, human review of actual outputs, and timing/token data
with aggregate deltas and variance. Remove assertions that always pass or fail
in both configurations and investigate inconsistent or high-cost outliers.

Description evals must use a fixed mixed train/validation split, repeated runs
where supported, near-miss negatives, and validation-based iteration choice.
Use train failures to guide revisions; do not overfit descriptions to exact
failed-query keywords or let a description exceed the 1,024-character
specification limit. The trigger owner is the `description` field: a trigger
eval observes whether the registered agent loaded the skill, not whether query
text contains a keyword. `argument-hint` may remain as a caller/UI hint, but a
separate `trigger` frontmatter field is not allowed.

Every migrated skill must expose a top-level `## 2. Usage` section and begin
`## 5. Ordered Execution Chain` with a plain-text flow diagram before the
step-by-step explanation. Usage owns invocation syntax; the execution diagram
owns the normal route. A downstream command or information table may appear
outside `Usage` under its owning section when it is not a second invocation
catalog. Its exact four columns are `Command or information`, `Arguments`,
`When to use`, and `Additional information`; one downstream route belongs in
each row.

For a skill review, the evaluator also checks the declared review scope: linked
local prose, named static methodology assets, link targets and owners, and
applicable ignore boundaries. A successful Markdown transaction verifies
lossless preservation; it does not replace the prose, authority, or link review.

For global skills, include `<project>/AGENTS.md` and any
`<coding-assistant>/AGENTS.md` as additional static roots when declared. Verify
that each extends `~/.agents/AGENTS.md` when available without becoming a
second policy owner. Keep reusable guidance placeholder-based and materialize
concrete project or assistant paths only in their corresponding local policy.
