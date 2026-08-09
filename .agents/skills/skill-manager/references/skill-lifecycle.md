# Skill lifecycle method

This reference is the reusable method for creating or changing any skill. It
does not create a second router; Usage in the parent `SKILL.md` owns the
canonical invocation grammar and the scripts remain its executable owner.
Domain-specific command or information tables may live under another owning
section when they document a delegated route rather than a second invocation
catalog.

## 1. Understand the request

Capture concrete examples of requests that should trigger the skill and
examples that should not. Record the expected outcome, user-facing language,
runtime location, constraints, delegated capabilities, and proof of success.
Ask only questions whose answers change the trigger, scope, ownership, safety,
or validation boundary. For description work, keep a fixed mixed train/
validation split of realistic positive and near-miss negative prompts; run each
prompt repeatedly where supported and use only train failures to guide edits.

## 2. Inspect the package and consumers

For an existing skill, read `SKILL.md`, linked references, scripts, tests,
folder maps, and applicable project or coding-assistant policies. Inventory local consumers and
existing user changes. Separate observed behavior, requested change, inference,
and unknowns. For a new skill, inspect neighboring skills for conventions but
do not copy their unrelated routers or provider metadata.

## 3. Define the smallest reusable package

Keep `SKILL.md` under 500 lines and put only the normal path, trigger contract,
delegation table, safety boundaries, and closeout proof there. Choose bundled
resources by function:

- `references/` for branch-specific knowledge, templates, schemas, and maps;
- `scripts/` for repeated deterministic work or fragile validation;
- `assets/` for files consumed by the skill's output, not instructions.

Do not add README, changelog, installation, or historical-review files merely
to explain how the skill was built. Use `index.md` only when the package has a
real folder map or the user explicitly requires one.

## 4. Create or update

For a new package, run the Skill Manager `init` command and then replace its
placeholder body with the real contract. For an existing package, make the
smallest compatible edit and update all in-scope links, maps, tests, and
consumers in the same change. The frontmatter must contain `name` matching the
directory and a precise `description` with both the job and trigger conditions.

Keep one owner for each command, information source, and completion decision.
Use placeholders such as `<project>`, `<coding-assistant>`, and `<agents-root>`
in reusable guidance. Materialize concrete paths only in local project or
coding-assistant policies and task-local records.

Usage owns the skill's invocation grammar. When a skill documents downstream
command options outside `Usage`, preserve the owner boundary with exactly four
columns: `Command or information` | `Arguments` | `When to use` |
`Additional information`. Keep one route per row and use the final column for
receipts, fallbacks, restrictions, or owner-specific details. Reviewers must
reject a duplicated invocation catalog but retain a necessary owner-specific
table.

Every package must expose seven top-level sections in order: Role & Scope,
Usage, Immutable Operational Rules, Input & Context Schema, Ordered Execution
Chain, Output & Completion Contract, and Evaluation Anchors. Usage owns the
canonical invocation and argument contract. Ordered Execution Chain begins
with a compact plain-text diagram, followed by the explanatory steps.

## 5. Freeze quality before judging the candidate

Define a non-filler JSONL matrix before candidate edits. Every case needs:

- a unique scenario and visibility;
- typed assertions;
- a concrete failure mode;
- a repair boundary; and
- an independent verifier outside the assertion wording.

Record the matrix fingerprint before RED. Evaluate the baseline without the
skill, preserve the exact failure/rationalization evidence, apply only
compatible repair actions, then evaluate GREEN against the same matrix. Require
the candidate source fingerprint to differ from baseline. Run challenge cases
only after every candidate case passes, using the same candidate source and
matrix fingerprint. Do not weaken the matrix after seeing a failure, reuse a
receipt from another source or matrix, or treat a score or measurement as
closure evidence.

Choose the test form from the baseline failure: use positive structural
contracts for wrong-shaped output or omissions; use bright-line counters and
red flags for discipline failures; and use explicit predicate/action pairs for
conditional behavior. For discipline skills, pressure-test with a no-guidance
control, at least three combined pressures, 5+ samples where supported,
manual review, and variance tracking. Capture rationalizations verbatim and
add a targeted counter before the next REFACTOR pass.

## 6. Validate and forward-test

Run the Skill Manager `validate` command, then `review` the skill and every
declared static root. Check frontmatter, naming, local links, scope, maps,
duplicate invocation routers, owner-specific option-table shape, stale
references, and ignored runtime boundaries. Run
`/md-compress` begin/finalize for each durable Markdown file before/after prose
editing. Run the owning project tests, type checks, and lint checks.

For a complex or high-risk skill, forward-test from a clean context with a
realistic user request. Supply raw artifacts, not the intended answer. Check
that the skill asks the right questions, uses the right owner, preserves scope,
emits the expected artifacts, and reaches a verifiable result without leaked
authoring context. For output evals, retain with-skill and without-skill (or
prior-version) outputs, timing/token data, assertion-level evidence, aggregate
pass-rate and variance, and human feedback. Read every flagged output; template
echoes and quoted counterexamples are not behavioral failures. Remove weak
assertions and inspect always-pass, always-fail, flaky, and time/token-outlier
cases. Treat inconsistent outputs across replications as a wording defect
requiring a tighter form, not as permission to add untested prose.

## 7. Close out

Report the exact changed files, commands, outputs, limitations, and remaining
follow-up. Preserve a resumable record when the work spans turns. Capture a
durable lesson only when it is specific, verified, and owned by the knowledge
base; do not store raw prompts, evaluation noise, or a generic success note.
