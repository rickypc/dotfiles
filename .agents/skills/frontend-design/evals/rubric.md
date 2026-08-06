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

# Frontend Design Evaluation Rubric

Each case checks a deterministic contract in the skill source. Candidate and
challenge cases must both pass before the skill is accepted. This matrix does
not replace repository tests, implementation review, accessibility proof, or
the project final gate.
