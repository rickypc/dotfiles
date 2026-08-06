# Skill lifecycle method

This reference is the reusable method for creating or changing any skill. It
does not create a second router; the command catalog remains in the parent
`SKILL.md` and the scripts remain its executable owner.

## 1. Understand the request

Capture concrete examples of requests that should trigger the skill and
examples that should not. Record the expected outcome, user-facing language,
runtime location, constraints, delegated capabilities, and proof of success.
Ask only questions whose answers change the trigger, scope, ownership, safety,
or validation boundary.

## 2. Inspect the package and consumers

For an existing skill, read `SKILL.md`, linked references, scripts, tests,
folder maps, and applicable runtime adapters. Inventory local consumers and
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
Use placeholders such as `<runtime-home>` and `<agents-root>` in reusable
guidance. Materialize concrete paths only in runtime adapters or task-local
records.

## 5. Freeze quality before judging the candidate

Define a non-filler JSONL matrix before candidate edits. Every case needs:

- a unique scenario and visibility;
- typed assertions;
- a concrete failure mode;
- a repair boundary; and
- an independent verifier outside the assertion wording.

Evaluate the baseline, apply only compatible repair actions, evaluate the
candidate, and run challenge cases only after every candidate case passes. Do
not weaken the matrix after seeing a failure and do not treat a score as
closure evidence.

## 6. Validate and forward-test

Run the Skill Manager `validate` command, then `review` the skill and every
declared static root. Check frontmatter, naming, local links, scope, maps,
duplicate routers, stale references, and ignored runtime boundaries. Run
`/md-compress` begin/finalize for each durable Markdown file before/after prose
editing. Run the owning project tests, type checks, and lint checks.

For a complex or high-risk skill, forward-test from a clean context with a
realistic user request. Supply raw artifacts, not the intended answer. Check
that the skill asks the right questions, uses the right owner, preserves scope,
emits the expected artifacts, and reaches a verifiable result without leaked
authoring context.

## 7. Close out

Report the exact changed files, commands, outputs, limitations, and remaining
follow-up. Preserve a resumable record when the work spans turns. Capture a
durable lesson only when it is specific, verified, and owned by the knowledge
base; do not store raw prompts, evaluation noise, or a generic success note.
