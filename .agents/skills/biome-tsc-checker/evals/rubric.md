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
# Biome TSC Checker Evaluation Rubric

Verify selected-path lint, TypeScript, and top-level declaration-order behavior
without target configuration changes or semantic declaration edits. Verify that
barriers and cycles are reported rather than crossed.

For a fresh-session scenario, verify that the JSON result protocol distinguishes
`passed`, `failed` with an action packet, and `blocked` without a permitted
reorder.
