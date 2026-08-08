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
# AIDX Evaluation Rubric

Verify that AIDX parses one valid six-section plan with gray-matter, safely
accepts equivalent relative and canonical absolute inputs, executes ordered
steps sequentially, and never becomes a second planner.
