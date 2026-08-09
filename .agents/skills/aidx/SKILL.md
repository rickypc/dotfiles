---
name: aidx
description: "Execute a previously materialized six-section plan from a relative .agents/plans path, parsing its YAML frontmatter with gray-matter and applying the execution steps sequentially when the user explicitly requests implementation."
---

# AIDX — Strict Plan Executor

## 1. Role & Scope

AIDX owns execution of one already-materialized plan produced by `/aidp`. It
is selected only when the user explicitly identifies a plan for
implementation. It applies the approved steps sequentially and closes with
fresh proof. Planning, repository discovery, plan authoring, plan import, and
skill-package ownership remain with `/aidp`, `/repo-search`,
`/knowledge-base`, and `/skill-manager` respectively.

AIDX does not create plans, ask the planner's requirements questions, retrieve
CBM/KB context, maintain a second plan state machine, slice plan content, or
interpret free-form plan text as shell commands. Read
[execution-contract.md](references/execution-contract.md) for the detailed
implementation, validation, repair, and stop-boundary contract.

## 2. Immutable Operational Rules

- Pass the user-supplied path unchanged to the executable parser. It must use
  `gray-matter`, canonicalize the path, and reject traversal, missing,
  directory, symlink-escaping, outside-tree, wrong-index, and invalid-plan
  inputs before mutation.
- Execute one ordered step completely before the next step in order. Preserve
  plan scope, exclusions, ownership, and expected proof; never skip, reorder,
  batch, or guess because a later step looks easier.
- Review the complete plan critically before starting. Raise material
  **questions or concerns** before touching files and return to `/aidp` when
  scope, ownership, architecture, acceptance, or a requirement changes.
- Use specialized skills only through the plan's explicit route and exact
  arguments. When a step changes any skill package, execute its `/skill-manager`
  owner step before the first skill edit.
- Require fresh verification evidence before every status claim: run the full
  command, read the full output and exit code, count failures, compare with the
  expected outcome, review the changed-file diff, and check requirements and
  exclusions. A prior receipt or another agent's report is not proof.
- For applicable behavior changes, use RED focused tests, minimal GREEN
  implementation, relevant existing tests, and refactor only after green. A
  test edit is blocked until `/bun-test-generator` has supplied its matrix and
  boundary receipt.

## 3. Input & Context Schema

- **Required:** A relative or absolute regular-file plan path inside
  `.agents/plans/<cbm-index>/`. The canonical execution contract is
  `bun <agents-root>/scripts/aidx.ts <relative-plan-path>`.
- **Optional:** An explicit completion action after all steps and proofs pass;
  the normal completion form is `complete <relative-plan-path>`.
- **Context:** The parser's canonical path receipt, YAML frontmatter, exactly
  six plan sections in order, ordered-step fields/check boxes, plan-supplied
  evidence, project instructions, routed-owner receipts, and the configured
  final gate.
- **Unknowns:** Invalid frontmatter, duplicate items, placeholders, exact
  interactive tokens such as `KEEP`, missing step proof, ambiguous scope, or
  missing route is a stop before mutation. Do not rediscover context the plan
  already supplies.

The parser requires exactly `title`, `cbm_index`, `created_at`, `updated_at`,
and `status` in frontmatter and the plan headings `ROLE`, `OBJECTIVE`, `CORE
DIRECTIVES`, `ORDERED EXECUTION STEPS`, `CONSTRAINTS`, and `INPUTS TO PROCESS`.
Each ordered item owns its status checkbox and complete action/target/boundary/
proof contract.

The parser requires the six sections in order and returns a canonicalized,
project-relative path. It also returns a canonical project-relative path. It
does not create plans. Never interpret the plan as a shell script; if a
requirement changes, Stop immediately, do not guess, and return to `/aidp`.

The accepted invocation is `/aidx <relative-plan-path>` or the equivalent
absolute path, but the canonical parser receives the path unchanged:

```text
bun <agents-root>/scripts/aidx.ts <relative-plan-path>
```

The regular-file boundary is `/.agents/plans/<cbm-index>/`; the launcher must
not prepend `<agents-root>/.agents/plans/`. `utils/aidx.ts` owns the parser and
the `complete` command owns the post-import cleanup. The required plan body
includes the inline section token `CORE DIRECTIVES`.

## 4. Ordered Execution Chain

1. **Parse:** Invoke the parser and read its complete receipt before editing.
   Derive the project root from the plan's own `.agents/plans/<cbm-index>/`
   route; do not prepend a runtime-home path or independently parse Markdown.
2. **Review:** **Review the plan critically before starting.** Present the six
   sections and ordered steps, create the checklist from those items, and
   resolve every material question before starting.
3. **Execute:** Execute step 1 completely: inspect its named inputs, make only
   the stated compatible change, and run its focused proof. Record the result,
   then execute the **next step in order**. Never interpret the plan as a shell
   script.
4. **Route and verify:** Select only explicit owner routes, retain their
   receipts, run requirements/exclusions checks, inspect the diff, and run the
   configured final gate exactly once after the implementation batch.
5. **Complete or stop:** On success run the path-only completion handoff. On a
   blocker, failed proof, or scope change preserve the plan and return to
   `/aidp` or the named owner; do not claim completion.

### Delegated skill routing table

| Command or information | Arguments | When to use | Additional information |
| --- | --- | --- | --- |
| `/skill-manager` | `<skill-manager-action> <absolute-skill-path> [matrix-and-review-inputs]` | A step changes a skill package, references, template, evals, or static assets | Run before the first edit and retain validation/review and candidate/challenge receipts. |
| `/bun-test-generator` | `<sut-path> <all\|method-list\|method-range>` | A step adds, converts, repairs, renames, or deletes a JS/TS unit test | Invoke before editing; retain the behavior matrix, boundary validation, and SUT proof. |
| `/playwright-test-generator` | `<criteria> <project-root> <playwright-runner>` | A step changes retained browser, UI, responsive, or browser-performance acceptance coverage | Use accepted criteria and the project's declared runner. |
| `/biome-tsc-checker` | `<selected-js-or-ts-paths>` | A step changes approved JS/TS source or tests and names this checker | Run after the compatible edit; it does not replace the final gate. |
| `/frontend-design` | `<ui-brief> <affected-screens> <design-system> <acceptance-criteria>` | Work creates, redesigns, or visually refreshes a user-facing interface | Run before implementation and preserve the accepted design. |
| `/react` | `<react-or-react-native-scope> <approved-design> <acceptance-criteria>` | Work implements React or React Native behavior after design/content settle | Keep design ownership with `/frontend-design` when applicable. |
| `Named project or language skill` | `<arguments exactly as written in the plan>` | AIDP identified an observed local owner | If route or language obligation is absent, return to `/aidp`. |

### Test-first and test-edit gate

When tests apply, write one focused failing test for the intended missing
behavior, confirm it fails for that behavior rather than a test error, make the
smallest implementation, run focused and relevant existing tests, and refactor
only after green. The minimal implementation must make the test passes result
explicit. Expected values are independent of the implementation; test
observable behavior and justified side effects against the real selected
system, then run mutation checks for wrong branches and missing effects.

Any step that adds, converts, repairs, renames, or deletes a JavaScript or
TypeScript test is blocked until `/bun-test-generator` runs for the real SUT.
Record its invocation and returned matrix before editing, then run
`validate-boundaries`; every external module and side-effect boundary must be
mocked while the selected SUT remains real. Passing coverage cannot substitute
for this receipt.

### Completion handoff

After all implementation steps and focused proofs pass, invoke:

```text
bun <agents-root>/scripts/aidx.ts complete <relative-plan-path>
```

The completion command passes only the relative path to KB `import-plan`,
reports the importer receipt, and deletes the source plan only after successful
import and receipt validation. It must fail without cleanup when import fails.

## 5. Output & Completion Contract

Success includes a successful parser receipt, changed artifacts, fresh proof
for every step, requirements and exclusions checklist, changed-file review,
configured final-gate result, relative plan path, and the knowledge-base import
and source-cleanup receipts. The final gate is the decision point; a status
checkbox, summary, or intention is not proof.

Failure preserves the plan and reports the exact step, command, output, exit
code, failed assertion, unresolved question, or owner handoff. A parse failure,
ambiguity, failed proof, or scope change is a stop condition, not a partial
success. Do not edit the plan from AIDX.

## 6. Evaluation Anchors

- **Canonical:** A valid plan is parsed with `gray-matter`, reviewed, and
  executed one step at a time with each focused proof recorded.
- **Boundary:** An invalid or symlink-escaping plan, free-form command, skipped
  step, stale status claim, missing route, or failed gate stops execution.
- **Challenge:** A multi-step plan forces AIDX to **Execute step 1 completely**,
  record its **focused proof**, and only then run the **next step in order**;
  a test edit also requires the Bun generator receipt.
- **Independent verifier:** The parser, routed-owner receipts, step proofs,
  requirements checklist, diff review, and final-gate result independently
  verify closure.
