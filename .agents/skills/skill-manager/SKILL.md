---
name: skill-manager
description: Use this skill when creating, updating, reviewing, renaming, synchronizing, optimizing, validating, or repairing an Agent Skill. It governs scope, trigger descriptions, progressive disclosure, scripts, evals, references, deterministic validation, and evidence-gated closeout.
argument-hint: "<operation> [arguments]"
---

# Skill Manager — Create, Maintain, and Govern Skills

## 1. Role & Scope

Skill Manager is the sole owner of every skill lifecycle request: create,
update, review, rename, synchronize, optimize, validate, or repair a skill,
including specialized capability skills. It owns the selected
package's frontmatter, normal path, router, delegated owners, references,
assets, matrices, prose/link review, validation, and closeout evidence. Domain
skills may supply knowledge or execute delegated work, but they do not mutate
skill packages.

The `quality-engine` owns evaluation state and receipts; Skill Manager owns the
skill contract, resources, references, matrices, repair packet, and final
changed-file/evidence handoff. Read [skill-lifecycle.md](references/skill-lifecycle.md)
for the method, [skill-template.md](references/skill-template.md) for the
shared seven-part contract, [agent-skills-guidance.md](references/agent-skills-guidance.md)
for Agent Skills specification and creation practices, and [index.md](references/index.md)
for the map. Load the Agent Skills guidance for package design, description,
evaluation, script, or specification decisions.

## 2. Usage

Use this skill for any Agent Skill creation, update, review, rename,
synchronization, optimization, validation, or repair request.

```text
/skill-manager init <skill-path> [description]         # create a new skill scaffold
/skill-manager validate <skill-path>                   # validate one skill package
/skill-manager review <root> [additional-root]         # review prose and links
/skill-manager evaluate <phase> <matrix> <skill-file>  # run one matrix phase
/skill-manager batch <review-id> <phase> <pairs>       # evaluate multiple targets
/skill-manager packet <review-id> <state> <skill-path> # return the next repair action
/skill-manager validate-skills                         # validate every global skill package

# Usage governance: commands are the canonical information and action routes.
# Put required arguments in <name>, optional arguments in [name], and no
# arguments in —. Keep normal calls first, alternatives at their decision
# point, and recovery last. Do not duplicate this contract in another table.
# Every referenced command must be defined above; dependencies belong in the
# Ordered Execution Chain.
```

Required and optional arguments are visible on each command line:

- `<operation>`: one of the operations shown above.
- `<skill-path>`: an absolute selected skill directory, or the exact skill file
  required by the command.
- `[additional-root]`: an optional absolute static root, used when a runtime
  adapter or neighboring static consumer must be reviewed.
- `<phase>`: `baseline`, `candidate`, or `challenge` for evaluation; `baseline`
  or `candidate` for batch evaluation.
- `<matrix>` and `<skill-file>`: absolute JSONL matrix and skill-file paths.
- `<pairs>`: one or more matrix/skill-file path pairs for batch evaluation.
- `<review-id>` and `<state>`: the persisted review identifier and state-derived
  packet state.
- `[description]`: optional scaffold metadata, limited to 1,024 characters.

Treat this block as the canonical command grammar. Keep the `#` comments
column-aligned, put optional arguments in `[brackets]`, and describe the
observable result or next action rather than repeating the command name.
`/skill-manager` is an agent workflow; do not execute the slash form in a
terminal.

### Domain-owned command and information tables

The aligned block above is the only invocation catalog for `/skill-manager`.
Do not duplicate that router in another section. A skill may still need a
command-options table outside its own `Usage` section when the table documents
a delegated command or information source, such as a context-retrieval route.
Put that table under the section that owns the route; it is an information
contract, not a second invocation grammar. Use exactly these four columns:

`Command or information` | `Arguments` | `When to use` | `Additional information`

Keep one downstream route per row. Preserve the owner command and argument
placeholders, state the observable condition for use, and put receipts,
fallbacks, restrictions, or implementation details in the final column.
Review all sections and linked prose for this distinction: reject duplicate
skill invocation catalogs, but retain a necessary owner-specific four-column
table outside `Usage`.

## 3. Immutable Operational Rules

- Preserve one owner for each command, information path, router, and completion
  decision. Do not create a second router or duplicate a neighboring owner.
- Define and **freeze the frozen matrix** before edits. Each case has typed
  assertions, failure mode, repair boundary, and independent verifier. Never
  weaken an assertion, change the same matrix to make a candidate pass, or
  reuse stale evidence.
- Start from persisted state: **Resume or prepare** one matching review run
  before editing. Preserve existing user changes and unresolved questions.
- Guard every in-scope durable Markdown file with `/md-compress` begin/finalize
  before/after prose edits, including unchanged linked prose. Preserve protected
  runtime/configuration boundaries and ignored state.
- Keep normal-path guidance inline, branch-only detail in one owned reference,
  and external sources only for authority/discovery that cannot be co-located.
  Prune duplicate, stale, no-op, speculative, negation-only, and fluffy prose.
- Keep `SKILL.md` under 500 lines and approximately 5,000 tokens; use
  progressive disclosure with relative, one-level-deep links to focused
  `references/`, `scripts/`, and `assets/` resources.
- Prefer a useful picture over a thousand words: put the smallest clear
  command example, table, or text diagram before prose, then keep the prose
  only for decisions, boundaries, predicates, and proof that the picture cannot
  express.
- Write descriptions as concise, imperative trigger guidance: state the user
  intent and the skill's job, include indirect contexts and useful keywords,
  define adjacent boundaries, and keep the field at or below 1,024 characters.
  The description is the activation boundary: do not add a separate `trigger`
  frontmatter field. Test it with realistic should-trigger and should-not-trigger
  prompts, including near-miss negative cases, record trigger rates across
  repeated runs where supported, and use a fixed train/validation split;
  select by validation performance and do not overfit to individual failed
  keywords. `argument-hint` is retained only as a caller/UI input hint and
  does not control activation. When a skill's Usage contract exposes
  caller-supplied arguments, add a matching compact `argument-hint` to its
  frontmatter; omit it only when the skill truly accepts no caller input.
- For output evals, compare clean with-skill and without-skill (or prior-version)
  runs, vary phrasing and edge cases, add assertions after observing outputs,
  require concrete assertion-level evidence for each grade, use deterministic
  verifiers for mechanical checks, inspect outputs and assertions manually, and
  retain timing/token, variance, and pass-rate deltas. Remove assertions that
  are always-pass or always-fail in both configurations and investigate
  outliers.
- Prefer one-off commands for existing tools; bundle repeated or fragile logic
  in `scripts/`. Reference bundled scripts with skill-root-relative paths,
  document dependencies and `--help`, keep scripts non-interactive, accept
  inputs through arguments/environment/stdin, emit structured output, and make
  errors state the problem, expected input, and what the agent should try next.
- Treat the seven headings as the document architecture, not as a wrapper. For
  an existing skill, make a content-ownership map first, then rewrite the
  entire source in place: move every retained paragraph, table, code block,
  and branch rule into one owning section or nested subsection and remove
  superseded blocks. Never prepend a seven-section shell over the old skill,
  append the old body after section 7, duplicate a command catalog, or add
  filler to satisfy the heading count. Sections need not have equal length.
- Never claim closure from a score or measurement. Deterministic validation,
  prose/link review, matrix receipts, project gates, and owner review decide
  pass/failure.

## 4. Input & Context Schema

- **Required:** An absolute skill path or static root, the lifecycle operation,
  and the applicable matrix/eval assets.
- **Optional:** Additional static roots, review id, candidate/challenge phase,
  delegated receipt, or a forward-test request.
- **Context:** Frontmatter, all canonical and linked durable Markdown, scripts,
  assets, eval matrices/rubrics, local links, static consumers, ignore rules,
  project and coding-assistant policies, existing user changes, and configured
  gates.
- **Unknowns:** Missing owner/source/matrix/verifier, invalid scope, stale link,
  missing resource, unresolved adapter, or unclear completion proof is a repair
  or clarification stop. Do not invent a score, provider, credential, or
  evidence.
- **Existing-document migration:** Record a content-ownership map before
  editing. Each retained block must have one of the seven section owners or an
  explicitly linked reference; mark obsolete blocks for removal rather than
  carrying them forward as a detached second half.

For global `.agents` review, read `.agents/.gitignore` before inventorying the
review set. Exclude every ignored path and machine-local runtime/coverage
state; include every non-ignored declared static path. Load
`<project>/AGENTS.md` when it exists as an additional project policy. It must
extend `~/.agents/AGENTS.md` when that global project policy is available.
When a coding-assistant-specific policy exists, load
`<coding-assistant>/AGENTS.md`; it follows the same rule and must extend
`~/.agents/AGENTS.md` when available.

## 5. Ordered Execution Chain

```text
request -> scope and owner -> persisted review state -> frozen matrix
        -> guarded edit -> candidate/challenge evaluation -> validation and gate
```

1. **Intake:** Resolve the package and its linked local prose, declared static
   roots, consumers, user changes, ignore scope, and adapter boundary. Follow
   links recursively, inventory the existing document's top-level and nested
   content, map each block to an owner section, and record the review set
   before baseline.
2. **Prepare evidence:** Resume or prepare the review id, define the non-filler
   matrix and fingerprint, record source fingerprints, run RED without the
   candidate guidance, and retain observed failures/rationalizations.
3. **Guard and edit:** Run `/md-compress` begin for every durable Markdown in
   the review set. Apply one compatible candidate batch only to approved paths,
   using the seven headings as the real document structure. Rewrite the complete
   `SKILL.md` in place; put the canonical invocation grammar in Usage, routing
   rules in Router Governance, and branch or downstream command-information
   tables in the section that owns them.
   Use nested subsections when needed, and remove superseded or duplicate
   legacy prose.
4. **Evaluate:** Run GREEN against the **same matrix**, require a changed
   **source fingerprint**, then run REFACTOR to close new loopholes. For
   trigger-description changes, run the fixed trigger-query set in
   `evals/trigger-queries.json` with repeated samples through the actual
   registered agent, classify invocation by whether the skill loaded, and
   choose the generalizing iteration from the fixed validation split. For
   output changes,
   compare clean with-skill and without-skill/prior-version runs, grade each
   assertion with evidence, capture timing/token deltas, and manually review
   outputs. Issue challenge evidence only from the same candidate source and
   matrix.
5. **Finalize and gate:** Run each returned Markdown finalize action, validate
   frontmatter/structure/resources, review prose and links, run applicable
   candidate/challenge checks and project gates, then return the changed-file
   handoff or a targeted repair packet.

### Review scope, prose, and link integrity

The review set is `SKILL.md`, every linked local prose asset, every
declared static methodology root, and the applicable adapter. Verify each
linked local prose asset exists inside approved scope, names the intended owner,
and is not stale, duplicated, or redirected through an unrelated router.
Review every durable Markdown file with `/md-compress`, even when unchanged;
that transaction proves token preservation but does not replace the prose,
authority, or link review. JSONL matrices, manifests, and source code remain
separate deterministic artifacts.

### Project and coding-assistant policy ownership

When `<project>/AGENTS.md` or `<coding-assistant>/AGENTS.md` exists, include it
as an additional static root and verify that it extends the available
`~/.agents/AGENTS.md` policy rather than replacing it. Keep reusable guidance
placeholder-based with `<project>` and `<coding-assistant>`; materialize the
actual project or assistant path only in the corresponding local policy.

### Evidence lifecycle: Matrix, RED/GREEN/REFACTOR, and pressure evidence

The RED-GREEN-REFACTOR loop is mandatory for behavior-changing guidance:

1. **RED:** Run the baseline without the candidate and preserve the exact
   failure/rationalization evidence.
2. **GREEN:** Apply the smallest repair and rerun the same frozen matrix.
3. **REFACTOR:** Identify new rationalizations, add targeted counters, and
   rerun candidate/challenge checks until stable.

Choose guidance form from the baseline: a bright-line rule, counter, and red
flag for pressure failures; a positive recipe/structural contract for wrong
shape; and a predicate/action/boundary for conditional behavior. For a
discipline skill use a no-guidance control, at least three combined pressures,
**5+** independent samples where supported, **manual** review of flagged
outputs, captured rationalizations, and **variance** as a signal. Record
pressure results without confusing a **score or measurement** with closure.

### Evaluation and verifier contract

Every `evals/rubric.md` has machine-readable `schemaVersion`,
`requiredCaseFields`, `requiredVisibility`, `minimumPassRate`, and fixed
`verifierIds`. The evaluator rejects missing/unknown verifier IDs and runs each
declared verifier through the in-process fixed registry; arbitrary shell
commands or descriptive verifier prose are not executable evidence. Candidate
and challenge receipts include executed independent-verifier checks.

## 6. Output & Completion Contract

Success returns a valid package, reviewed scope, matrix fingerprint, baseline/
candidate/challenge source fingerprints, changed files, Markdown transaction
receipts, frontmatter/resource/link findings, deterministic validation, owner
review, project gate results, limitations, and a final handoff. The cohesion
review must show that the seven headings contain the migrated contract, every
retained block has one owner, no detached second half remains, and heading
count was not achieved with filler. Resolve the final gate in this order:
the user-approved gate configured in `aidx.json`, then `.agents test`, then
`bun run test`. Run the selected gate completely and retain its exact command
and result; all required checks within it must pass.

Failure returns the exact finding, failed assertion, owner boundary, missing
resource/link, matrix/source mismatch, or gate output plus the repair packet.
No score, measurement, intention, candidate receipt, or partial green check
closes the review. Do not use provider-driven training or an unavailable
external owner as a hidden dependency.

## 7. Evaluation Anchors

- **Canonical:** A skill update resumes a review, freezes a matrix, runs RED,
  maps existing content, guards Markdown, rewrites one cohesive seven-section
  candidate, runs GREEN and REFACTOR, challenges the same source/matrix,
  validates, reviews, and gates.
- **Boundary:** Wrong owner, weakened assertion, broken link, ignored runtime
  state, missing adapter/resource, stale receipt, detached second half,
  filler, or failed deterministic gate stops closure. A seven-heading count alone
  is not proof of cohesion.
- **Challenge:** A skill requiring judgment, research, interaction, or
  delegation keeps uncertainty and ownership inside the seven sections rather
  than imposing a robotic exact-output persona.
- **Independent verifier:** The `quality-engine`, deterministic validator,
  matrix/source fingerprints, Markdown protection, prose/link review, and
  project gates independently verify closure.
