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

# Repo Search Evaluation Rubric

The matrix freezes the observable contract of the Repo-Search Engine. Candidate
checks cover the complete repository-search contract, approved root scopes,
compact search planning, transport determination with the CLI transport primary
and the MCP transport as the runner-dependent fallback, denial recovery, each
staged fallback predicate, evidence tracing, refinement, mandatory routing for
all repository/file discovery, and the compact report shape. Challenge checks
target likely shortcuts: guessed paths, treating a cache-private or sandbox
CLI denial as backend unavailability or an empty result, fallback reordering,
direct shell/file discovery, hidden uncertainty, and completion without
structural evidence.

The matrix is evaluated before and after the candidate guidance with the same
source and matrix fingerprints. RED, GREEN, and REFACTOR receipts are required;
a score or a single successful output is not closure evidence. Independent
source-structure checks verify the durable contract, while the owning skill's
forward test verifies the behavior in a clean context.
