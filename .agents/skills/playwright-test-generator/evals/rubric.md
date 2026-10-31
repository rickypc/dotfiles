---

schemaVersion: 1
requiredCaseFields: [id, visibility, scenario, assertions, failureMode, repairBoundary, independentVerifier]
requiredVisibility: [candidate, challenge]
minimumPassRate: 1
verifierIds: [source-structure]
---

# Playwright Test Generator Evaluation Rubric

The package also conforms to the shared seven-part skill contract, in this order:

1. role and scope;
2. usage;
3. immutable operational rules;
4. input and context schema;
5. ordered execution chain;
6. output and completion contract;
7. evaluation anchors.

The part right after usage is immutable operational rules. The canonical matrix checks each heading
and challenges brittle exact-output or robotic-persona language; the contract must remain compatible
with this skill's uncertainty, ownership, and proof boundary.

Each case checks a deterministic contract in the skill source. Candidate and challenge cases must
both pass before the skill is accepted. This matrix does not replace project-owned browser
execution, test review, or the project final gate. Also verify that each retained test names a
user-visible break, exercises the real flow, asserts rejection and recovery behavior where
applicable, controls side-effect boundaries, and catches realistic mutations.
