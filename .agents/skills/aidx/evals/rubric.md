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
# AIDX evaluation rubric

The AIDX matrix is a deterministic contract check for the skill instructions.
Every case declares a scenario, visibility, typed assertions, failure mode,
repair boundary, and an independent verifier. Candidate cases must pass before
challenge cases run. A failed candidate produces a Skill Manager repair packet;
the matrix must not be weakened to make it pass.

The matrix does not replace repository tests, Biome, TypeScript,
declaration-order, final-gate, or prose/link review. Those remain separate
evidence. The independent verifier records how the case is checked outside the
assertion wording; the Skill Manager receipt is the deterministic result.
