---

name: skill-manager
description: Use this skill when creating, updating, reviewing, renaming, synchronizing, optimizing, validating, or repairing an Agent Skill. It governs scope, trigger descriptions, progressive disclosure, scripts, evals, references, deterministic validation, and evidence-gated closeout. Use it for agent instruction documents too, including AGENTS*.md; it governs their lifecycle, scope, authority, routing, validation, and closeout.
argument-hint: <operation> [arguments]
---

# Skill Manager - Govern Agent Skills and Instructions

## 1. Role & Scope

Skill Manager owns lifecycle work for Agent Skill packages and user-authorized agent instruction
documents. Instruction documents include `AGENTS*.md` and equivalent runtime-selected policies,
workflow guides, and agent playbooks. It owns scope, routing, references, validation, and closeout;
the existing policy or domain owner retains authority over its requirements and decisions.

For Agent Skills, Skill Manager owns frontmatter, normal path, router, delegated owners, references,
assets, matrices, prose and link review, package validation, and closeout evidence. Domain skills may
supply knowledge or execute delegated work, but they do not mutate a skill package. For instruction
files, Skill Manager checks the active instruction chain, preserves its owner and format, and does
not force instruction files into the skill template.

The `quality-engine` owns evaluation state and receipts. Skill Manager owns the skill contract,
instruction maintenance procedure, resources, matrices, repair packet, and final evidence handoff.
Read [skill-lifecycle.md](references/skill-lifecycle.md) for the lifecycle,
[skill-template.md](references/skill-template.md) for the seven-part Agent Skill contract,
[agent-skills-guidance.md](references/agent-skills-guidance.md) for Agent Skills requirements, and
[index.md](references/index.md) for the package map. Load the guidance for package design,
description, evaluation, script, or specification decisions.

## 2. Usage

Use this skill for Agent Skill creation, update, review, rename, synchronization, optimization,
validation, and repair, and for user-authorized lifecycle work on an agent instruction document.

```text
/skill-manager instructions <file-path> <operation>   # maintain one instruction document
/skill-manager init <skill-path> [description]        # create an Agent Skill scaffold
/skill-manager validate <skill-path>                  # validate one Agent Skill package
/skill-manager review <root> [additional-root]        # review prose, policy chain, and links
/skill-manager evaluate <phase> <matrix> <skill-file> # evaluate one frozen matrix phase
/skill-manager batch <review-id> <phase> <pairs>      # evaluate multiple skill targets
/skill-manager packet <review-id> <state> <path>      # create the next repair action packet
/skill-manager validate-skills                        # validate global Agent Skill packages
# Usage governance: keep required <name> and optional [name] arguments explicit.
```

For the `instructions` route, `<operation>` is `create`, `update`, `review`, `rename`, `synchronize`,
`optimize`, `validate`, or `repair`. `<file-path>` is the exact absolute instruction path;
`<skill-path>` is the absolute package directory. `[additional-root]` is an optional absolute static
root used when a runtime adapter or neighboring static consumer must be reviewed. The `/skill-manager`
routes are agent workflows, not terminal commands. Use the owning scripts only for their documented
mechanical checks. For evaluation, `<phase>` is `baseline`, `candidate`, or `challenge`; batch
evaluation accepts `baseline` or `candidate`. `<matrix>` and `<skill-file>` are absolute JSONL matrix
and skill-file paths. `<pairs>` contains one or more absolute matrix and skill-file path pairs.
`<review-id>` is the persisted review identifier. `<state>` is `candidate-checked`,
`candidate-requested`, or `draft`, as returned by the workflow. `[description]` is optional scaffold
metadata limited to 1,024 characters.

Usage governance: the aligned block is the only invocation catalog. Use `<name>` for required
arguments, `[name]` for optional arguments, and `-` when a command takes none. Keep comments
column-aligned; put normal actions first, alternatives at their decision point, and recovery last.
Describe the observable result or next action in each comment. Define every referenced command in
the block and put its dependencies in `Ordered Execution Chain`.

### Domain-owned command and information tables

Put domain-owned command and information tables outside the invocation catalog under their owning
section, with exactly four columns:

`Command or information` | `Arguments` | `When to use` | `Additional information`

Keep one downstream route per row. Preserve owner commands and argument placeholders, state the
observable condition for use, and put receipts, fallbacks, restrictions, and implementation details
in the final column. Review all sections and linked prose for this distinction: reject duplicate
invocation catalogs, but retain necessary owner-specific tables outside `Usage`.

## 3. Immutable Operational Rules

- Preserve one owner for each policy decision, command, information path, router, and completion
  gate. Skill Manager governs the file lifecycle; it does not replace the file's policy owner.
- Resolve the active instruction chain from runtime and repository evidence before editing. An
  `AGENTS*.md` filename alone does not prove that the file is active. Follow explicit lane and path
  exclusions; never use an inactive file as a workaround.
- A child policy must extend its applicable parent. Preserve precedence, ownership, and all
  unrelated user changes. Preserve user-owned changes. Never replace parent policy, invent missing
  authority, or edit outside the user-authorized scope.
- Keep the target document's existing format and governing requirements. Apply the seven-section
  contract only to Agent Skill `SKILL.md` files; do not force instruction files into the skill
  template.
- Keep normal-path guidance inline, branch-only detail in one owned reference, and external sources
  only for authority or discovery that cannot be co-located. Prune duplicate, stale, no-op,
  speculative, negation-only, and fluffy prose.
- Prefer the smallest clear command example, table, or text diagram before prose. Keep prose for
  decisions, boundaries, predicates, and proof that the example, table, or diagram cannot express.
- For a skill package change, define and freeze the quality matrix before editing. Every case needs
  typed assertions, failure mode, repair boundary, and independent verifier. Never weaken the frozen
  matrix or reuse stale evidence.
- Resume or prepare the matching quality-engine review before editing. If that state or a required
  verifier is unavailable, state the exact blocker and stop before the governed edit.
- Use `/md-compress` begin/finalize for every in-scope durable Markdown file, including linked prose
  reviewed without edits. Preserve protected tokens, runtime configuration, ignored state, and
  backups; stop on a guard failure.
- For global `.agents` roots, read `.agents/.gitignore` before inventory. Never edit protected
  `.agents` configuration files such as `.gitignore`, `biome.jsonc`, `bunfig.toml`, `LICENSE`,
  `NOTICE`, `package.json`, or `tsconfig.json`.
- Keep `SKILL.md` below 500 lines and about 5,000 tokens. Use progressive disclosure and focused,
  relative, one-level links. Reusable guidance uses placeholders, not machine-specific paths.
- Write skill descriptions as concise, imperative trigger guidance: state the user intent and job,
  relevant indirect contexts, useful keywords, and neighboring boundaries; limit them to 1,024
  characters. The `description` field owns activation;
  `argument-hint` does not control activation. Do not add a competing `trigger` field. Test trigger
  changes with balanced, realistic positive and near-miss negative prompts and repeated runs through
  the actual registered agent where available.
  Keep `argument-hint` only as a compact caller/UI hint. When `Usage` exposes caller-supplied
  arguments, provide a matching hint; omit it only when the skill accepts no caller input.
- For output evaluations, compare clean with-skill and without-skill or prior-version runs. Vary
  wording and edge cases, inspect assertion-level evidence, use deterministic checks for mechanical
  claims, review actual outputs, and record timing, token use, variance, and pass-rate changes.
- Prefer one-off commands for existing tools. Bundle repeated or fragile logic in `scripts/`, use
  skill-root-relative paths, document dependencies, and pin versions when reproducibility matters.
  Scripts must accept inputs through arguments, environment, or stdin, expose concise `--help`,
  emit structured output, and give errors that state the problem, expected
  input, and next action.
- Capture materially repeated workflows as reusable guidance: stable inputs, ordered steps,
  boundaries, validation, and recovery. Make the act-check-react loop explicit: perform the action,
  verify with the named check, and react to its result at that boundary. Preserve human judgment as
  escalation or decision points, not hardcoded verdicts. Keep extracted guidance generic; omit
  session-specific tools, paths, and one-off payloads.
- Keep the seven section headings as a skill document's architecture. For an existing skill, map
  content ownership first, rewrite the entire source in place, move retained content under one owner
  or nested subsection, and remove superseded blocks. A heading count alone does not prove cohesion;
  never leave a detached second half or add filler. Sections need not have equal length.
  Map every retained paragraph, table, code block, and branch rule to one owning section or linked
  reference. Never prepend a seven-section shell, append the old body after section 7, or duplicate
  the invocation catalog.
- Never claim closure from a score or measurement. Deterministic checks, matrix receipts, policy and
  link review, applicable project gates, and owner review decide pass or failure.

## 4. Input & Context Schema

- **Required:** The requested lifecycle operation, exact absolute target path or static root,
  artifact type, applicable policy owner, and proof needed to close the change. Skill changes also
  require the applicable matrix and evaluation assets.
- **Optional:** Additional static roots, a review id, a skill selector, candidate or challenge
  phase, delegated receipt, or forward-test request.
- **Context:** Active parent and child instructions, runtime file precedence, linked durable prose,
  package resources, consumers, ignore rules, user changes, matrix and rubric, and configured gates.
- **Unknowns:** Missing authority, active-path resolution, source, matrix, verifier, access, or
  completion proof; invalid scope; stale link; missing resource; or unresolved adapter is a stop.
  Ask only for the missing fact that changes scope or correctness. Do not invent a score, provider,
  credential, source, or evidence.
- **Skill migration:** Record a content-ownership map before rewriting. Every retained block belongs
  to one of the seven sections or a linked reference; obsolete blocks are removed.
- **Instruction maintenance:** Record which files are active, their parent/child relationships, and
  why each is in scope. Do not infer applicability from a filename or edit an excluded lane.

For a global `.agents` review, read `.agents/.gitignore` first. Exclude every ignored path and
machine-local runtime or coverage state; include every applicable declared non-ignored static path,
including project, coding-assistant, and runtime-selected override roots. Verify that each existing
child policy extends its available parent. Keep reusable guidance placeholder-based; put concrete
paths only in the corresponding local policy.

## 5. Ordered Execution Chain

```text
request -> artifact and active owner -> review state and frozen matrix
        -> Markdown guards -> RED -> cohesive candidate -> GREEN/REFACTOR/challenge
        -> deterministic validation -> owner review and gate -> closeout
```

1. **Resolve:** Identify the exact artifact and operation. For instructions, establish the active
   file, its owner, parent chain, exclusions, and consumers. For a skill, resolve its package,
   linked prose, static roots, consumers, ignore scope, and adapter. Follow local prose links
   recursively, inventory top-level and nested content, map each block to an owner, and record the
   review set before baseline.
2. **Prepare evidence:** Preserve existing user changes. Resume or prepare the matching review,
   define a non-filler matrix, freeze its fingerprint, record source fingerprints, and run RED before
   editing. Retain exact failures and rationalizations. For instructions, capture the authority chain
   and relevant requirements.
3. **Guard and edit:** Begin `/md-compress` for each in-scope durable Markdown file. Apply one
   compatible batch only to authorized paths. Keep an instruction document in its existing format.
   For a skill, map content ownership and rewrite the complete source in place as one cohesive
   seven-section document. Keep invocation grammar in `Usage`, routing rules with their owner, and
   branch or downstream command-information tables in their owning section. Use nested subsections
   where needed and remove superseded blocks.
4. **Check:** Run GREEN against the same matrix and require a changed source fingerprint. Use
   REFACTOR to close new loopholes, then run challenge cases against the same candidate source and
   matrix. For trigger changes, use `evals/trigger-queries.json`, repeated runs through the actual
   registered agent, and the fixed validation split. For output changes, compare clean with-skill and
   without-skill or prior-version runs, grade each assertion with evidence, retain timing/token
   deltas, and manually review outputs. For instructions, review precedence, active-path selection,
   links, cross-file conflicts, and the exact requested rule.
5. **Finalize:** Run every exact Markdown finalize action. Validate frontmatter, structure, and
   resources or the instruction format; review links and policy inheritance; then run applicable
   project gates. React to failed checks at that boundary. Never hide a failure or cross an owner
   boundary.

If a project gate returns a non-blocked action packet, apply its validated required action groups
through the explicit apply route owned by that command. Verify allowed paths and forbidden actions,
then rerun the identical gate. Never display or hand off a safe packet without applying it. A
missing, blocked, ambiguous, or unsafe packet is a repair stop.

### Review scope, prose, and link integrity

The review set includes the target, every linked local prose asset, declared static roots, and the
applicable adapter. Read `.agents/.gitignore` before inventory and exclude ignored paths. Include
`<project>/AGENTS.md`, `<coding-assistant>/AGENTS.md`, and `~/.agents/AGENTS.md` as additional static
roots when applicable. Verify that each child extends its parent rather than replacing it. Every
local link must exist within approved scope, name its intended owner, and be current; reject stale,
duplicate, or unrelated-router links. Use `/md-compress` begin/finalize for every in-scope durable
Markdown file, including linked prose reviewed without edits. Markdown guards prove token
preservation, not correct authority or meaning. JSONL matrices, manifests, and source code use
their own deterministic checks. Keep concrete project or assistant path details in local policy.

The policy owner remains authoritative for content. A project or coding-assistant policy may narrow
scope or strengthen its parent; it must not silently replace it. Follow explicit runtime precedence
when both a base file and an override exist.

### Evaluation contract

Each `evals/rubric.md` defines machine-readable `schemaVersion`, `requiredCaseFields`,
`requiredVisibility`, `minimumPassRate`, and fixed `verifierIds`. Reject missing or unknown verifier
ids. Run declared verifiers only through the in-process fixed registry; arbitrary shell commands and
descriptive verifier prose are not executable evidence. Candidate and challenge receipts must show
that independent verifiers actually ran.

Use the frozen `evals/cases.jsonl` and, when applicable, `evals/trigger-queries.json`. Record the
matrix fingerprint before RED and keep it unchanged through candidate and challenge; record source
fingerprints for every phase. **RED** runs without the candidate and preserves exact failures and
rationalizations. **GREEN** applies the smallest repair to the same matrix. **REFACTOR** identifies
new rationalizations, adds targeted counters, and reruns candidate and challenge checks until stable.
Choose the guidance form from baseline evidence: a bright-line rule, counter, and red flag for
pressure failures; a positive recipe or structural contract for wrong shape; and a
predicate/action/boundary for conditional behavior.

For discipline evaluations, use a no-guidance control, at least three combined pressures, 5+
independent samples where supported, manual review of flagged outputs, captured rationalizations,
and variance as a signal. Remove always-pass or always-fail assertions, inspect outliers, and retain
the evidence; scores or measurements do not close a review.

Description evaluations use a fixed train/validation split, balanced `should-trigger` and
`should-not-trigger` cases, repeated runs, and observed trigger rates from the actual registered
agent. Classify invocation by whether the skill loaded. Use training failures to guide edits, choose
the generalizing iteration from held-out validation, and do not overfit exact failed-query keywords.

For output evaluations, compare clean with-skill and without-skill or prior-version runs, vary
phrasing and edge cases, then add assertions based on observed outputs. Retain concrete
assertion-level evidence for each grade, use deterministic verifiers for mechanical claims, and
manually review actual outputs. Record timing/token, pass-rate, and variance deltas. Remove
assertions that always pass or fail in both configurations; inspect inconsistent outputs and outliers.

Scripts used by the workflow must be non-interactive, expose `--help`, and emit structured output.
Errors should say what failed, what was expected, and what the agent should try next.

## 6. Output & Completion Contract

For a skill, return the reviewed package, matrix and source fingerprints, evaluation receipts,
changed files, Markdown transactions, frontmatter/resource/link findings, deterministic validation,
owner review, project gates, limitations, and handoff. The cohesion review proves all retained
content has one owner, the seven headings contain the migrated contract, no detached second half
remains, and heading count was not achieved with filler.

For an instruction file, return the exact changed files, active policy chain, authority and
inheritance findings, Markdown transactions, link and format checks, project gates, limitations, and
handoff. Confirm that the child still extends its parent and unrelated user changes remain intact.

Failure names the exact finding, failed assertion, owner boundary, missing resource or link, stale
receipt, matrix/source mismatch, or gate output, with its repair packet. Do not claim completion
from a score, measurement, intent, candidate receipt, partial green check, provider-driven training,
or unavailable external owner. For skill packages, the final gate is the project-approved `finalGate`
in `aidx.json`, otherwise `.agents`'s `bun run test`, otherwise `bun run test`. Run the selected gate
completely, retain its exact command and result,
and require every check to pass.

## 7. Evaluation Anchors

- **Canonical:** Skill updates use one frozen matrix, RED/GREEN/REFACTOR, a cohesive seven-section
  rewrite, challenge evidence, deterministic validation, prose review, and the configured gate.
- **Instruction lifecycle:** `AGENTS*.md` and equivalent agent policies use the same owner, evidence,
  guard, and closeout discipline while retaining their own format and policy authority.
- **Boundary:** Wrong owner, inactive target, broken inheritance, changed user work, weakened
  assertion or matrix, broken link, missing adapter or resource, stale receipt, ignored protected
  state, detached or filler skill content, or failed deterministic gate stops closure. A seven-heading
  count alone is not proof of cohesion.
- **Challenge:** Preserve uncertainty and delegated judgment; do not impose brittle exact-output
  behavior on skills or instructions that require research, interaction, or owner decisions.
- **Independent verifier:** Quality-engine receipts, deterministic validation, matrix and source
  fingerprints, Markdown token checks, active-policy review, links, and project gates independently
  verify closure.
