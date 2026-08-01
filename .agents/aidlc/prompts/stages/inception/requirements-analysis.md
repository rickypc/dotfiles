---
stage: requirements-analysis
number: "2.3"
phase: inception
condition: "always"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 2.3 Requirements Analysis

Turn the approved intent into testable requirements. For brownfield work,
start with the Reverse Engineering evidence and the cited codebase-memory
findings; for greenfield work, start with the approved intent. Do not require
an omitted user-story stage, a mockup, or a local artifact tree.

## Analysis method

1. Extract each requested capability, affected actor, trigger, observable
   outcome, boundary, failure behavior, and acceptance criterion.
2. Separate functional requirements from quality constraints. Keep security,
   performance, reliability, accessibility, privacy, compatibility, and
   operational constraints explicit when they matter.
3. Map each requirement to evidence: a user request, a verified existing
   behavior, a validated KB rule, or an explicit assumption. Do not convert a
   plausible implementation detail into a requirement without naming it.
4. Identify contradictions, dependencies, out-of-scope work, migration or
   compatibility obligations, and questions that actually block design.
5. Record the requirements in the central intent's **Decisions** and **Plan**
   sections. A useful requirement has an identifier, priority where material,
   acceptance criteria, affected boundary, and traceable evidence source.

## Acceptance criteria

Use observable, testable language. Include success, failure, and boundary
cases where relevant. For UI work, state user-visible states and accessibility
expectations; 2.5 translates them into a single UI definition only when UI is
in scope. For API or data work, state contract, validation, error, and
compatibility expectations. For brownfield changes, state what behavior must
remain unchanged.

## Handoff

Summarize the requirements-to-design traceability expected from Application
Design and the validation evidence expected from Construction. Run the
intent-evidence sensor, record completion, and continue. Do not create a new
approval gate; the approved 1.7 scope remains the authorization boundary.
