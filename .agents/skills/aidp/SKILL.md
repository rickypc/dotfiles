---
name: aidp
description: "Interactively create or update a six-section YAML-frontmatter implementation plan under <project>/.agents/plans/<cbm-index>/ when requirements must be clarified and persisted before execution."
---

# AIDP — Plan Authoring

## 1. Role & Scope

AIDP owns requirements clarification and materialization of one implementation
plan. It is selected when a feature, fix, refactor, or plan revision needs
persisted execution detail. Its user-visible result is one validated plan that
is ready for `/aidx`; AIDP never implements the plan, edits source code, or
executes an implementation step. `/aidx` owns execution, and
`/knowledge-base` owns importing a completed plan as durable knowledge.

The plan contains exactly six body headings: `ROLE`, `OBJECTIVE`, `CORE
DIRECTIVES`, `ORDERED EXECUTION STEPS`, `CONSTRAINTS`, and `INPUTS TO PROCESS`.
Use [plan-authoring-contract.md](references/plan-authoring-contract.md) for
the detailed field and evidence contract, and [template.md](template.md) for
the physical plan template.

## 2. Immutable Operational Rules

- Resolve the project, local instructions, approved CBM context, and private-KB
  context before asking plan questions; retain the generated context records.
- Ask only questions whose answers can change scope, ownership, architecture,
  safety, or proof. A material ambiguity is a clarification stop: do not guess
  and leave the plan unwritten.
- Keep authoring controls in AIDP. The materialized plan must describe the
  implementation outcome and AIDX execution responsibility, not phrases such
  as “AIDP only materializes,” “do not run `/aidx`,” or “planning-only.” The
  **Plan-content firewall** must reject leaked controls before writing.
- Preserve the six plan headings, one status checkbox on every ordered item,
  exact target ownership, dependency order, and focused proof. Reject
  placeholders, duplicate headings/items, unsafe paths, literal `KEEP`, and an
  incomplete candidate.
- Preserve an existing same-slug plan's `created_at` and retained items;
  atomically replace only after the complete candidate validates. A failed
  candidate leaves the existing plan unchanged.
- Distill research into generalized patterns. Project-specific names and
  values may remain only when the user explicitly requests that project's
  plan; reusable plans must discard them rather than let them reach AIDX.
- AIDP never edits source. It only materializes the plan and hands execution to
  AIDX after the plan is complete.

## 3. Input & Context Schema

- **Required:** One plan request and the ordered answers for the six plan
  sections. List sections are supplied as JSON arrays of one to five non-empty
  strings per batch.
- **Optional:** `--project <project-root>` when the intended project is not the
  current working directory, supplied references, refresh evidence, or an
  existing same-slug plan being updated.
- **Context:** The resolved project root and `<cbm-index>`, project guidance,
  README-first repository intake, command/entrypoint inventory, approved
  language profile, CBM receipt, KB receipt, target map, and acceptance proof.
- **Unknowns:** Missing scalar answers, an empty list before its minimum, an
  unsupported language/owner, unresolved target, or ambiguous requirement is a
  stop. Report the exact question or evidence gap instead of inventing a
  default.

Before decomposition, classify each target by observed responsibility and map
every create, modify, test, reference, and configuration target to one owner.
Record observed facts, inferences, decisions, rejected alternatives, and
uncertainty separately. For a refactor request, establish behavior and
preservation invariants, coverage gaps, scope exclusions, and the smallest
safe increment before drafting steps.

## 4. Ordered Execution Chain

1. **Intake:** Derive the project root and `<cbm-index>`, read local guidance,
   perform README-first intake, and retrieve CBM/KB context through their
   owning wrappers. Do not make the temporary request path part of routing.
2. **Question:** Ask scalar questions only when materially dependent. Collect
   each list in one JSON-array batch per round, using `KEEP` only as an
   interactive update control and never as materialized content.
3. **Plan:** Build the target map, implementation-ready ordered steps, proof,
   dependencies, boundaries, and the appropriate create/update/refactor or
   research-distillation branch. Every ordered item is independently testable.
4. **Validate and write:** Materialize the candidate in memory, run the plan
   integrity and content-firewall checks, then atomically create or overwrite
   the one same-slug path. Do not write a partial plan.
5. **Handoff:** Print the absolute plan link and the exact `/aidx
   <absolute-plan-path>` command, then stop. AIDP does not run AIDX.

### Command catalog

The single public materializer owns template rendering, YAML parsing,
slugification, CBM/KB intake, validation, and atomic persistence. Select the
operation; do not probe unsupported flags or invent a second command.

| Operation | When to use | Exact invocation or action | Result and next action |
| --- | --- | --- | --- |
| Create a new plan | The derived `.agents/plans/<cbm-index>/<slug>.md` path does not exist. | `bun <agents-root>/scripts/aidp.ts [--project <project-root>] "<plan-request>"` | Writes one validated plan and prints its absolute path plus `/aidx`; stop without execution. |
| Update an existing plan | The same derived slug exists and the user supplied feedback. | Use the identical command with the request needed to select that slug. | Preserve `created_at`, replace the complete candidate atomically, and leave the old plan on failure. |
| Add, replace, remove, or reorder items | A section list must change. | Use the identical update command; there is **no separate section subcommand**. | Submit the complete desired list in JSON-array batches, using `KEEP` for retained positions and `[]` only after the complete list. |
| Abort on unresolved requirements | A required scalar/list answer is unknown or invalid. | Stop answering and ask the focused question. | Malformed JSON, a non-array, non-string items, more than five items, or an early empty list reports the section and **batch round**, exits nonzero, and writes nothing. |

Every list uses **one batch prompt**, a **JSON array**, and **at most **5**
non-empty strings** per round; **never issue one prompt per item**. `KEEP` is
not a plan value. Generated context entries are owned by AIDP and must not be
duplicated during an update.

### Plan integrity and research branches

Each ordered step starts with its own [ ] checkbox. There is one checkbox per
item; a legend is explanatory only and never replaces the item's marker. The
accepted markers are `[ ]`, `[~]`, `[!]`, `[x]`, or `[-]` plus a reason, and
each item contains its action, target, boundary, dependency, and focused proof.
If a candidate is missing its own checkbox, reject the candidate before
materialization.
There is exactly one checkbox per item.
Reject exact `KEEP`, `TBD`, `TODO`, duplicate inputs, unsafe or absolute plan
paths, slug/index mismatches, duplicate headings/items, and vague steps.

For research, use primary evidence where available and retain the generalized
pattern, destination section, applicability reason, and proof rather than
copying the example. Retain only generalized workflow controls; discard
project-specific domain vocabulary so it must not reach AIDX. For refactors,
include baseline behavior, preserve behavior, inspect test coverage, record
rejected alternatives, and sequence the smallest safe increment. Run the
self-review and map every objective, acceptance criterion, constraint, and
exclusion to an item and proof; verify that dependencies are consistent.

Retain the generalized pattern rather than copying the source example. Every
target has one responsibility, a verified symbol, and an expected outcome.
Do not use placeholders in an implementation-ready plan.

Repository intake is README-first: inspect primary files and high-signal
directories, produce a documented command inventory, and separate observed
facts from inferred classification and ambiguity. When there is an observed
language/framework, select only relevant shared guidance from `common.md` and
`profiles.md`, then map proof to the project-owned final gate.

The intake explicitly inspects high-signal directories and an observed
language/framework before selecting only the relevant profile guidance.
The observed language/framework is recorded before profile selection.

### Plan-content firewall

AIDP authoring controls belong in this skill. Before writing, reject any
candidate that carries “AIDP only materializes,” “do not run `/aidx`,” “without
implementation,” “do not mutate source,” or “planning-only” into `ROLE`,
`OBJECTIVE`, `CORE DIRECTIVES`, `ORDERED EXECUTION STEPS`, or `CONSTRAINTS`.
The plan must instead state the implementation scope, AIDX execution
responsibility, ordering, and proof. The error identifies the contradiction;
it does not silently materialize it.

The materializer must reject an authoring-only control before writing it when
the draft confuses its lane restrictions with deliverable requirements.

### Compatibility details for the materializer

The executable owner remains `scripts/aidp.ts`, with validation helpers in
`utils/aidp.ts`; it reads `<agents-root>/skills/aidp/template.md` and writes
only `.agents/plans/` beneath the selected project. There is no separate
`validate`, `--section`, `--answers`, `--update`, `add-section`, or
`update-section` command. A successful receipt exposes `absolutePlanPath`.

Project derivation uses `<project-root>/<project-name>` and
`<project-root>-<project-name>`. When language guidance applies, read
`common.md` first and select evidence-backed sections from `profiles.md`.
The runtime configuration boundary includes `.agents/package.json`,
`biome.jsonc`, `bunfig.toml`, and `tsconfig.json`; do not mutate it as part of
plan authoring.

The canonical materializer form is:

```text
   bun <agents-root>/scripts/aidp.ts [--project <project-root>] [plan-request]
   ```

The unindented equivalent is:

```text
bun <agents-root>/scripts/aidp.ts [--project <project-root>] [plan-request]
```

The option is also named `--project`; the update control is the literal
`"KEEP"`, and the trigger is `/aidp`. The successful handoff is
`/aidx <absolute-plan-path>` in an absolute-path `plaintext` block.
`/aidx <relative-plan-path>` is not the canonical handoff. Any plan target
that changes a skill package must name `/skill-manager` before the first skill
edit.

The canonical same-slug paths are
`.agents/plans/<cbm-index>/<slugified-summary>.md` beneath
`.agents/plans/<cbm-index>/`.

The update rules say **Add or append a section item**, **Replace one section
item**, and **do not re-enter** generated context.

For an update, AIDP performs fresh CBM/KB context reads and does not re-enter
generated context. The command catalog includes **Add or append a section
item** and **Replace one section item**; retained list positions use `KEEP` and
the complete list finishes with `[]`.

An existing plan update must **overwrite that same path**, **preserve
`created_at`**, and update `updated_at`; a failed candidate leaves the
existing plan unchanged. If any target belongs to a skill package, the plan
must name `/skill-manager` before any skill change and require its
validation/review proof.

The update proof must preserve `created_at`. When any target belongs to a skill
package, require the owner before any skill change.

## 5. Output & Completion Contract

Success produces exactly one absolute plan path, validated YAML frontmatter
(`title`, `cbm_index`, `created_at`, `updated_at`, `status`), the six required
headings, per-item status markers, target/proof detail, CBM/KB receipts, and an
explicit `/aidx` handoff. The final result must be `created` or `updated` and
must identify the canonical path.

The integrity validator and atomic write are the completion proof. A summary,
questionnaire response, score, or intended plan is not proof. On failure,
report the section, batch round, exact validation reason, and whether the prior
plan was preserved; do not edit source or run `/aidx`.

## 6. Evaluation Anchors

- **Canonical:** A complete brief is clarified, mapped to owned targets, and
  materialized through `template.md` as one six-section plan with independently
  testable ordered steps.
- **Boundary:** Missing requirements, malformed JSON, an unsafe path, leaked
  authoring controls, or a failed integrity check causes a clarification or
  validation stop with no write.
- **Challenge:** Updating an existing same-slug plan retains `created_at`,
  replaces the same path, avoids duplicate generated inputs, and hands off only
  the exact absolute path.
- **Independent verifier:** The AIDP parser/integrity check, matrix assertions,
  CBM/KB receipts, and atomic write receipt independently verify the result.
