# AIDX execution contract

AIDX consumes the approved plan as its requirement boundary. It executes steps
in order, records proof for each step, and stops when a step is vague, missing
its named target or proof, or changes scope, ownership, architecture, or
acceptance. It does not rediscover requirements or silently repair the plan.

Implementation guidance belongs here: make the smallest compatible change,
protect shared consumers, mock external boundaries in tests, run focused proof
for changed behavior, and reserve the configured final gate for the final
decision. Validation failures are repaired as one compatible batch; a material
scope change returns to `/aidp`.

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
knowledge-base handoff, and cleanup.
