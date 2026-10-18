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

The package also conforms to the shared seven-part skill contract: role and scope, usage, immutable
operational rules, input and context schema, ordered execution chain, output and completion
contract, and evaluation anchors. The canonical matrix checks each heading and challenges brittle
exact-output or robotic-persona language; the contract must remain compatible with this skill's
uncertainty, ownership, and proof boundary.

Verify selected-path lint, TypeScript, and top-level declaration-order behavior without target
configuration changes or semantic declaration edits. Verify that barriers and cycles are reported
rather than crossed.

For a fresh-session scenario, verify that the JSON result protocol distinguishes `passed`, `failed`
with an action packet, and `blocked` without a permitted reorder.
