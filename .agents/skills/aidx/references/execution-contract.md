# AIDX execution contract

AIDX consumes the approved plan as its requirement boundary. The plan must use
the exact six-section order `ROLE`, `OBJECTIVE`, `CORE DIRECTIVES`,
`ORDERED EXECUTION STEPS`, `CONSTRAINTS`, and `INPUTS TO PROCESS`. Every item
under `ORDERED EXECUTION STEPS` has its own status checkbox and named target,
source-to-target decision, dependency, reason, acceptance proof, and stop
condition. AIDX executes items in order, records proof for each item, and stops
when an item is vague, missing its named target or proof, or changes scope,
ownership, architecture, or acceptance. It does not rediscover requirements
or silently repair the plan.

Implementation guidance belongs here: make the smallest compatible change,
protect shared consumers, mock external boundaries in tests, run focused proof
for changed behavior, and reserve the configured final gate for the final
decision. Validation failures are repaired as one compatible batch; a material
scope change returns to `/aidp`.

Before execution, critically review the plan and raise any missing target,
dependency, acceptance condition, or proof. AIDX may create its checklist only
after the review finds no material concern. During execution, mark an item
complete only after its named proof has been run freshly, its complete output
and exit code have been read, failures have been counted, and the expected
outcome has been confirmed. A previous receipt, partial check, or delegated
success report is not completion evidence.

For applicable feature, bug-fix, and behavior-changing refactor work, the
ordered proof lane is test-first: focused failing test, expected red result,
minimal compatible implementation, green result including relevant existing
tests, then refactor while green. The plan must identify any explicit
exception. Test expectations name the production break, are derived
independently from the implementation, assert observable behavior on the real
selected system, and use mocks only for justified boundaries. A test-quality
failure or missing delegated-generator receipt blocks completion.

Before final completion, re-read the plan and check every objective,
acceptance criterion, exclusion, and ordered item; inspect the changed-file
diff; and run the configured final gate once after the complete compatible
batch. Report the actual result, not the intended result.

Every JavaScript or TypeScript test edit has a hard pre-edit dependency on
`/bun-test-generator`. Record its invocation and behavior-matrix receipt
before editing, then run `validate-boundaries` against the real selected SUT
and test source. The selected SUT must remain real; all imported modules and
side-effect boundaries must be mocked. Unit, coverage, or skill-validation
success never substitutes for this generator proof. Missing generator or
boundary evidence blocks completion.

Plan input safety is part of execution proof. Resolve a relative input from the
selected project root and canonicalize an absolute input. Require a regular
file under `.agents/plans/<cbm-index>/`, reject traversal and symlink escapes,
validate the canonical plan before execution, preserve the original input in
the receipt, and pass only the canonical project-relative path to completion,
knowledge-base handoff, and cleanup. If an item names a skill package, follow
its explicit `/skill-manager` item first and retain its validation/review proof.
