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

The package also conforms to the shared six-part skill contract: role and scope, immutable operational rules, input and context schema, ordered execution chain, output and completion contract, and evaluation anchors.
The six headings are the document architecture, not an additive wrapper: an existing skill must migrate retained content into one owning section or nested subsection, remove superseded blocks, and pass a cohesion review beyond the heading count. The canonical matrix checks this shape and challenges brittle exact-output or robotic-persona language; the contract must remain compatible with this skill's uncertainty, ownership, and proof boundary.

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

For a skill review, the evaluator also checks the declared review scope: linked
local prose, named static methodology assets, link targets and owners, and
applicable ignore boundaries. A successful Markdown transaction verifies
lossless preservation; it does not replace the prose, authority, or link review.

For global runtime skills, include any declared role-based adapter as an
additional static root and verify that it extends the universal parent without
becoming a second policy owner. Require placeholder-based role and path names
in reusable guidance, and verify that a concrete adapter materializes them
with its actual runtime identity only in that adapter.
