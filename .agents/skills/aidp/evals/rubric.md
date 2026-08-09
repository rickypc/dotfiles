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
# AIDP evaluation rubric

Measure whether AIDP creates a complete, fail-closed, prose-only plan with
typed inputs, owned targets, ordered proof, explicit fallback, and one absolute
handoff. Challenge ambiguity, implementation leakage, unsafe updates, and
missing proof.
