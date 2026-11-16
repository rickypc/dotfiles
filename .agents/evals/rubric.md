---
acceptanceRule: all-hard-assertions-and-axes-pass
aggregateScore: none
axes:
  negative-constraint-adherence:
    evidence: Captured output, tool trace, and changed-file diff.
    fail: A forbidden outcome appears in output, trace, or diff.
    pass: No forbidden outcome appears in any captured evidence.
  schema-diff-integrity:
    evidence: Changed-file diff and parsed structure.
    fail: An unrelated structure or data field changed.
    pass: Only the requested structure and data changed.
  scope-discipline:
    evidence: Changed-path list and declared repair boundary.
    fail: Any changed path is outside the declared boundary.
    pass: Every changed path is inside the declared boundary.
  step-sequence-compliance:
    evidence: Captured tool trace with ordered steps.
    fail: A required action is missing, skipped, or reordered.
    pass: Required actions appear in the required order.
graderDisagreement: block
minimumPassRate: 1
requiredCaseFields:
  contract:
    - kind
    - id
    - visibility
    - scenario
    - assertions
    - failureMode
    - repairBoundary
    - independentVerifier
  behavior:
    - kind
    - id
    - split
    - taskFamily
    - task
    - fixture
    - expectedOutcomes
    - forbiddenOutcomes
    - hardAssertions
    - rubricAxes
    - failureMode
    - repairBoundary
requiredSplits:
  - train
  - validation
  - challenge
requiredVisibility:
  - candidate
  - challenge
schemaVersion: 2
verifierIds:
  - matrix-shape
  - source-structure
---

# Instruction evaluation rubric

## Acceptance

Evaluate each case against its stated task, fixture, expected outcomes, forbidden outcomes, hard
assertions, and rubric criteria. Contract cases remain deterministic checks with their original
verifier and assertion meaning. Behavior cases add an evidenced pass or fail for every fixed axis.

A candidate passes only when every deterministic hard assertion passes and all four axes receive an
agreed pass with observable evidence. A hard failure, disputed axis, missing result, stale
fingerprint, or unsupported field blocks acceptance. Do not average, weight, or otherwise aggregate
scores to hide a failure.

## Axis interpretation

### Schema and diff integrity

Check that parsed structures and changed data match the requested edit. A pass changes only the
requested structure and data; a fail changes unrelated structure or data.

### Negative constraint adherence

Check captured output, tool trace, and diff for forbidden outcomes. A pass has no forbidden outcome;
a fail contains at least one.

### Step sequence compliance

Check the ordered tool trace against the required workflow. A pass includes each required action in
order; a fail omits, skips, or reorders an action.

### Scope discipline

Check changed paths against the stated repair boundary. A pass keeps every changed path inside the
boundary; a fail changes any path outside it.

## Evidence and challenge handling

For every axis result, retain the axis id, pass/fail status, concise evidence, and grader agreement
state. Hard assertions are recomputed from captured output, tool trace, and diff; a claimed result
that disagrees with that computation is malformed. Bind each score to the case id, frozen matrix
fingerprint, and source fingerprint.

Keep train, validation, and challenge splits distinct. Keep candidate and challenge visibility
distinct. Use challenge cases as independent checks after candidate selection, and do not use their
feedback to tune that candidate.
