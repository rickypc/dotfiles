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

The package also conforms to the shared seven-part skill contract: role and scope, usage, immutable operational rules, input and context schema, ordered execution chain, output and completion contract, and evaluation anchors.
The canonical matrix checks each heading and challenges brittle exact-output or robotic-persona language; the contract must remain compatible with this skill's uncertainty, ownership, and proof boundary.

Each case checks a deterministic contract in the skill source. Candidate and
challenge cases must both pass before the skill is accepted. This matrix does
not replace repository tests, implementation review, accessibility proof, or
the project final gate.

For discovery behavior, the evaluation must distinguish a positive design
recipe from a discipline boundary: the recipe names focused questioning,
alternatives, trade-offs, and a recommendation; the boundary prevents
implementation handoff before review and approval. Do not accept attractive
visual prose as evidence that unresolved requirements were handled.

Grounded-design cases must also preserve a current-only baseline, a reusable
design context, and explicit iteration routing: branch genuinely different
directions, then revise the selected direction in place while preserving its
rationale. These additions support reusable visual judgment without introducing
a separate workflow or implementation authority.
