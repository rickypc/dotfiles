---

schemaVersion: 1
requiredCaseFields: [id, visibility, scenario, assertions, failureMode, repairBoundary, independentVerifier]
requiredVisibility: [candidate, challenge]
minimumPassRate: 1
verifierIds: [source-structure]
---

# React Evaluation Rubric

The package also conforms to the shared seven-part skill contract, in this order:

1. role and scope;
2. usage;
3. immutable operational rules;
4. input and context schema;
5. ordered execution chain;
6. output and completion contract (right after the ordered execution chain);
7. evaluation anchors (always last).

The canonical matrix checks each heading and challenges brittle exact-output or robotic-persona
language; the contract must remain compatible with this skill's uncertainty, ownership, and proof
boundary.

Each case checks a deterministic contract in the skill source. Candidate and challenge cases must
both pass before the skill is accepted. This matrix does not replace project tests, browser or
device proof, accessibility review, or the project final gate.
