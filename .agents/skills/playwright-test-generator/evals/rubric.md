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

# Playwright Test Generator Evaluation Rubric

The package also conforms to the shared seven-part skill contract: role and scope, usage, immutable operational rules, input and context schema, ordered execution chain, output and completion contract, and evaluation anchors.
The canonical matrix checks each heading and challenges brittle exact-output or robotic-persona language; the contract must remain compatible with this skill's uncertainty, ownership, and proof boundary.

Each case checks a deterministic contract in the skill source. Candidate and
challenge cases must both pass before the skill is accepted. This matrix does
not replace project-owned browser execution, test review, or the project final
gate. Also verify that each retained test names a user-visible break, exercises
the real flow, asserts rejection and recovery behavior where applicable,
controls side-effect boundaries, and catches realistic mutations.
