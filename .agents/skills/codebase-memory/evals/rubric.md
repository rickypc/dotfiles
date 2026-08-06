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

# Codebase Memory Evaluation Rubric

Verify allowed-root, readiness, and wrapper-only discovery behavior. The skill
must expose its shared wrapper to callers and must not teach direct use of the
underlying code-graph engine.
