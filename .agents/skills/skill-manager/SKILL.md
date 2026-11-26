---
name: skill-manager
description: >-
  Use whenever the requested work maintains or evaluates an Agent Skill or agent instruction/policy
  file: create, edit, repair, restructure, merge, rename, validate, check links/resources or stale
  guidance, tune activation descriptions/evals, run Skill Manager's training loop, or reconcile
  policy conflicts. Requests to make a skill trigger reliably or run its training loop belong here
  even when the target skill is named; they do not ask you to execute that target skill. Do NOT use
  to install or execute another skill, discover repository facts, review or implement product code,
  compress unrelated Markdown (use md-compress), or plan unrelated software work.
argument-hint: <operation> [arguments]
---

# Skill Manager - Govern Agent Skills and Instructions

## 1. Role & Scope

Skill Manager owns Agent Skills and user-authorized instruction lifecycles: `AGENTS*.md`, runtime
policies, workflow guides, and playbooks. It governs scope, routing, references, validation, and
closeout; policy/domain owners retain requirement authority.

For skills, it owns frontmatter, paths, routing, delegated owners, references/assets, matrices, and
prose/link review. Domain skills may advise or perform delegated work but cannot mutate packages.
For instructions, it resolves the active chain and preserves owner and format without imposing the
skill template.

`quality-engine` scripts own CLI/input checks, deterministic measures, receipts, and state.
`train measure` scores; `weak-reader` answers saved probes and checks output format with its pinned
model; `instruction-gate record` applies receipt policy; `verify` checks freshness. Outputs are
evidence, not repair decisions. The agent chooses commands, source-checks findings, edits, and picks
next steps; the user owns project decisions/approvals.

Training rule: no provider endpoint, credential, or model identifier exists. The local flow uses the
pinned reader.

Load only needed references: [train-protocol.md](references/train-protocol.md),
[skill-lifecycle.md](references/skill-lifecycle.md),
[skill-template.md](references/skill-template.md),
[agent-skills-guidance.md](references/agent-skills-guidance.md), and
[index.md](references/index.md).

## 2. Usage

Use this skill for Agent Skill creation, update, review, rename, synchronization, optimization,
training, validation, and repair, and for user-authorized lifecycle work on an agent instruction
document.

```text
/skill-manager instructions <file-path> <operation>             # maintain one instruction document
/skill-manager init <skill-path> [description]                  # create an Agent Skill scaffold
/skill-manager validate <skill-path>                            # validate one Agent Skill package
/skill-manager review <root> [additional-root]                  # review prose, policy chain, and links
/skill-manager evaluate <phase> <matrix> <skill-file>           # evaluate one frozen matrix phase
/skill-manager batch <review-id> <phase> <pairs>                # evaluate multiple skill targets
/skill-manager packet <review-id> <state> <path>                # create the next repair action packet
/skill-manager validate-skills                                  # validate global Agent Skill packages
/skill-manager ratchet <previous> <next>                        # prove a matrix or query set only grew
/skill-manager train bundle <skill-path>                        # emit the blind router bundle
/skill-manager train measure <skill-path> <responses> [flags]   # score, gate, append ledger
/skill-manager train read <bundle> <answers>                    # answer a document bundle with the local weak reader
/skill-manager train suggest <bundle> <failures> <suggestions>  # ask the weak reader how to fix its train misses
/skill-manager gate record [flags] [<doc-path>...]              # record a never-worse receipt; flags may add --agents-root <absolute-path>
/skill-manager gate verify [--agents-root <absolute-path>]      # require a current receipt for every instruction
/skill-manager gate evaluate-batch <request> [<output>]         # score candidate texts per document in one reader run; no receipt
/skill-manager gate calibrate <owner-id>... [--write]           # mutate atoms and record which probes flip; --write stores it in the maps
/skill-manager audit <agents-root> [owner-id]                   # read-only atom-map audit: findings and probe sensitivity per owner
/skill-manager audit <agents-root> --check                      # fail unless every instruction document has an atom map that audits clean
/skill-manager atoms <agents-root> [owner-id] [--write]         # preview or rebuild atom maps, manifest lists, and source hashes after an edit
/skill-manager propose <agents-root> <proposal-json>            # snapshot up to 3 candidate deltas for one document; writes no repository file
/skill-manager check <agents-root> <batch-id>                   # score the batch in one GPU reader run; print one verdict and the selected candidate; a behavioral edit needs a passing seal
/skill-manager commit <agents-root> <batch-id>                  # write the selected candidate; the only verb that writes an instruction file
/skill-manager seal <agents-root> <owner> <case> <capture> <sha>   # seal one target run of a behavior case against a candidate text
/skill-manager train measure <skill-path> --track contract      # score the SKILL.md body from its matrix
/skill-manager train select <skill-path> [--track contract]     # report winner, live state, next action
# Usage governance: keep required <name> and optional [name] arguments explicit.
```

For the `instructions` route, `<operation>` is `create`, `update`, `review`, `rename`,
`synchronize`, `optimize`, `validate`, or `repair`. `<file-path>` is the exact absolute instruction
path; `<skill-path>` is the absolute package directory. `[additional-root]` is an optional
additional static root used when a runtime adapter or neighboring static consumer must be reviewed.
The `/skill-manager` routes are agent workflows, not terminal commands. Use the owning Bun script
for each mechanical operation, with only that script's documented flags. The `<phase>` value depends
on the route:

Phase sets belong to their route. `evaluate` accepts `baseline`, `candidate`, and `challenge`;
`batch` accepts only `baseline` and `candidate`. Never carry `evaluate`'s `challenge` phase into
`batch`.

`<matrix>` and `<skill-file>` are absolute JSONL matrix and skill-file paths. `<pairs>` contains one
or more absolute matrix and skill-file path pairs. `<review-id>` is the persisted review identifier.
`<state>` is `candidate-checked`, `candidate-requested`, or `draft`, as returned by the workflow.
`[description]` is optional scaffold metadata limited to 1,024 characters. `<previous>` and `<next>`
are absolute matrix `.jsonl` or trigger query set `.json` paths; take `<previous>` from
`git show HEAD:<path>` written under the OS temp directory. `<responses>` is an absolute
router-answer `.jsonl` path. A train target is an absolute skill directory (activation track) or an
absolute comprehension set `.json` path (document track). The training CLI is
`bun <agents-root>/scripts/skill-manager/index.ts train measure <skill-path> <responses> [flags]`.
The valid `[flags]` are `--measure-only`, `--attempt <n>`, `--status <ledger-status>`, `--runs <n>`,
`--ledger-root <path>`, and `--skills-root <path>`; statuses are `baseline`, `attempt`, `applied`,
`post-change`, and `rollback`. `<bundle>` is the absolute document bundle `.json` that
`train bundle` printed, saved by the caller; `<answers>` is the absolute `.jsonl` path the reader
writes for `train measure`. `train read` runs
`bun <agents-root>/scripts/weak-reader/index.ts <bundle> <answers>`; its contract is:

```text
exit code is 0 when answered and 1 on any failure, and the failure envelope `data.reason` is `failure`, `integrity`, `missing-dependency`, `no-adapter`, or `too-long`.
```
`no-adapter` returns no answers, blocks the run and writes no receipt.

The pinned Gemma reader is required and answers saved probes.

For training, in-session child agents may answer blind bundles.

Rule: child-agent answers do not replace the Gemma reader. `<failures>` is an absolute JSON array of
train misses, and `<suggestions>` is the absolute `.jsonl` path written by `train suggest`. For one
document, run `bun scripts/instruction-gate/index.ts record <doc-path>` from `<agents-root>`.
`gate verify` runs `bun scripts/instruction-gate/index.ts verify`; it is read-only and needs no GPU.
`record` requires a GPU; use the handoff in the ordered execution chain when no approved runner
exists. Its flags are `--allow-equal` is the flag `--allow-equal <reason>`; `--rebaseline <reason>`,
`--allow-swap <reason>`, and `--rotate-pool <pool-file>`; reason flags require written reasons. For
a global document with calibrated atoms, `record` protects its core probes (the ones a calibration
run saw flip): losing a core train probe always rejects. Losing any other train probe is a swap,
accepted only with `--allow-swap` and only when the edit gains at least as many probes as it loses;
held-out validation may never lose a pass. Each distinct text of a document scored against its
held-out probes is a look, and a third look in one epoch is blocked until `--rotate-pool` names a
sealed pool file. The `gate` routes also take `--agents-root <absolute-path>`, placed before the
document paths. `<doc-path>` is an instruction document path relative to the agents root, or
`descriptions` for skill routing. A skill description decides when the skill is loaded; run
`gate record descriptions` after editing. For a project-local document, pass
`--agents-root <absolute-path>` with the absolute path of the project `.agents` directory. That root
holds the document, its comprehension set, and its receipt. The scripts still run from the global
package. `descriptions` is gated only for the global root. `--runs` belongs to `train measure`,
never `instruction-gate record`. For global catalog freshness, only accepted `record descriptions`
receipts increment manifest `activationRuns`; `train measure --runs` has no effect.

`gate evaluate-batch` runs
`bun <agents-root>/scripts/instruction-gate/index.ts evaluate-batch <request> [<output>]`.
`<request>` is an absolute JSON file with `schemaVersion: 1` and a `targets` array. Each target has
a `document` path and 1 to 3 `candidates`; each candidate has an `id` and optional text `source`. If
`source` is absent, that candidate uses the current file. It needs the same GPU route as
`gate record`, prints one JSON result with per-probe pass vectors, measurements, and failure
diagnoses, writes the optional absolute `<output>`, and writes no receipt or ledger. A candidate may
also carry `intents`, each `{"id","op","prompt","options","expected"}` with `op` one of `add`,
`modify`, `retire`, or `move`. The same run scores each intent on the current text and on the
candidate text and reports `before`, `after`, and `proven`: an `add` or `modify` must fail before
and pass after, a `retire` the reverse, and a `move` must pass both times.
`gate calibrate <owner-id>... [--write]` runs
`bun <agents-root>/scripts/instruction-gate/index.ts calibrate`. For each document of the owner it
mutates up to 8 atoms (delete, negate, and swap two ordered steps), asks the mutated atom's probes
on each mutant, and counts a probe as flipped when its answer differs from the unmutated answer. It
needs the GPU route of `gate record`, prints one JSON report that lists the probes that never
flipped, and with `--write` stores the counts in the atom maps. `audit` and `atoms` work on atom
maps; the train protocol section on atom maps defines atoms, their findings, and when to run each.
Every instruction and skill document has an atom map, and `audit --check` runs in `bun run test` and
fails when one is missing. `propose`, `check`, and `commit` are the librarian verbs for editing a
document; [librarian.md](references/librarian.md) defines the delta ops, the verdict, and the
refusals, and `seal` records the behavior seals it requires. `commit` writes the selected candidate
but does not refresh its instruction-gate receipt. After commit, run `gate record`; the old receipt
is stale until that command accepts the new text.

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
- A child policy extends its applicable parent and preserves precedence, ownership, and unrelated
  user changes. Never replace the parent, invent missing authority, or edit beyond authorized scope.
- Keep the target document's existing format and governing requirements. Apply the seven-section
  contract only to Agent Skill `SKILL.md` files; do not force instruction files into the skill
  template.
- Keep normal-path guidance inline, branch-only detail in one owned reference, and external sources
  only for authority or discovery that cannot be co-located. Prune duplicate, stale, no-op,
  speculative, negation-only, and fluffy prose.
- Prefer the smallest clear command example, table, or text diagram before prose. Keep prose for
  decisions, boundaries, predicates, and proof that the example, table, or diagram cannot express.
- Freeze the quality matrix before a skill change. Each case needs typed assertions, failure mode,
  repair boundary, and independent verifier; never weaken the matrix or reuse stale evidence.
- Resume or prepare the matching quality-engine review before editing. Missing review state blocks a
  governed edit; missing GPU access does not block authorized work. Complete the edit and available
  checks, then use the GPU handoff in the execution chain. Never claim a gate passed before checking
  its output.
- For edits, process one Markdown source at a time. Only use begin, edit, and finalize when changing
  the source: call `/md-compress begin <absolute-markdown-path>` immediately before editing, edit
  only the returned source in the same session, then call the exact returned
  `/md-compress finalize <absolute-markdown-path>` action immediately and require the `done` receipt
  before opening another transaction or running unrelated work. The `edit` step is the caller's file
  edit, not a `/md-compress` command; the standalone tokens `begin` and `finalize` name the two
  `/md-compress` actions. Preserve protected tokens, runtime configuration, ignored state, backups,
  and locks.
- If a Markdown guard or finalization fails, preserve the backup and lock. Before declaring a
  blocker, search the private knowledge base and persistent user memory for recovery matching the
  exact error. Verify any recovery against the owning skill and current state; apply only a
  supported recovery. If none applies, report the exact failure and preserve the transaction state.
  Never manually alter or discard its backup or lock, or start a replacement transaction for that
  source.
- For global `.agents` roots, read `.agents/.gitignore` before inventory. Never edit protected
  `.agents` configuration files such as `.gitignore`, `biome.jsonc`, `bunfig.toml`, `LICENSE`,
  `NOTICE`, `package.json`, or `tsconfig.json`.
- Keep the skill body below 500 lines and about 5,000 tokens. Use progressive disclosure and
  focused, relative, one-level links. Reusable guidance uses placeholders, not machine-specific
  paths.
- Write skill descriptions as concise, imperative trigger guidance: state the user intent and job,
  relevant indirect contexts, useful keywords, and neighboring boundaries; limit them to 1,024
  characters. The `description` field owns activation; `argument-hint` does not control activation.
  Do not add a competing `trigger` field. Test trigger changes with balanced, realistic positive and
  near-miss negative prompts and repeated runs through the actual registered agent where available.
  Keep `argument-hint` only as a compact caller/UI hint. When `Usage` exposes caller-supplied
  arguments, provide a matching hint; omit it only when the skill accepts no caller input.
- For output evaluations, compare clean with-skill and without-skill or prior-version runs. Vary
  wording and edge cases, inspect assertion-level evidence, use deterministic checks for mechanical
  claims, review actual outputs, and record timing, token use, variance, and pass-rate changes.
- Prefer one-off commands for existing tools. Bundle repeated or fragile logic in `scripts/`, use
  skill-root-relative paths, document dependencies, and pin versions when reproducibility matters.
  Scripts must accept inputs through arguments, environment, or stdin, expose concise `--help`, emit
  structured output, and give errors that state the problem, expected input, and next action.
- Capture materially repeated workflows as reusable guidance: stable inputs, ordered steps,
  boundaries, validation, and recovery. Make the act-check-react loop explicit: perform the action,
  verify with the named check, and react to its result at that boundary. Preserve human judgment as
  escalation or decision points, not hardcoded verdicts. Keep extracted guidance generic; omit
  session-specific tools, paths, and one-off payloads.
- Wrap every Markdown file you edit with the reflow transform, never by hand: preview with
  `bun <agents-root>/scripts/reflow.ts <changed-files>`, then apply with `--write`. It fills prose
  lines into the 81-100 column band and keeps links, code spans, and parentheticals whole.
- Keep the seven section headings as a skill document's architecture. For an existing skill, map
  content ownership first, rewrite the entire source in place, move retained content under one owner
  or nested subsection, and remove superseded blocks. A heading count alone does not prove cohesion;
  never leave a detached second half or add filler. Sections need not have equal length. Map every
  retained paragraph, table, code block, and branch rule to one owning section or linked reference.
  A retained block that fits none of the seven sections goes to a linked reference, never to an
  eighth section or a detached second half. Never prepend a seven-section shell, append the old body
  after section 7, or duplicate the invocation catalog.
- Never claim closure from a score or measurement. Deterministic checks, matrix receipts, policy and
  link review, applicable project gates, and owner review decide pass or failure.
- Training never makes a skill worse. Record a baseline before editing; keep an edit only when the
  `train measure` gate returns `accepted`: deterministic checks pass, the frozen query set is
  unchanged, no query that passed at baseline fails, and at least one query newly passes on every
  run. Otherwise restore the baseline snapshot. Never hand-edit the ledger or a snapshot.
- Keep measurement blind. Only fresh child agents given the blind bundle answer router prompts; the
  editing agent never answers them. Revise from train failures only; held-out validation reports
  counts, never query text. Never copy a failed query's keywords into a description.
- Matrices and query sets only grow. A wrong or obsolete query is retired with a written reason,
  never edited or deleted. Prove growth with `ratchet` against the committed version before
  closeout. When the baseline already passes every query, append harder near-miss queries, ratchet,
  and record a new baseline; do not declare the skill optimal.
- Every changed instruction or skill description needs a current receipt from its owner’s `record`
  route; a rejection is not a receipt. Follow retry guidance in
  [train-protocol.md](references/train-protocol.md).
- Train every document, not only `SKILL.md`. Decide separately from each file's actual path:
  1. **Inside a skill package:** include every Markdown file below that package root, at any depth.
     This includes `skills/demo/README.md`, `skills/demo/references/index.md`
     (`references/index.md`), and `skills/demo/references/setup.md` (`references/setup.md`).
  2. **Directly at a root:** include only instruction files located directly at the agents root or
     project root whose names begin with `AGENTS`, `CLAUDE`, or `GEMINI`. Dotted names such as
     `GEMINI.md` and `CLAUDE.override.md` qualify.

  Root `README.md` and `package.json` do not qualify. A root file does not inherit package scope
  because a review lists it beside a package file. A nested file outside a skill package does not
  qualify under the root rule. Set locations are defined in
  [train-protocol.md](references/train-protocol.md).

  The target reader is a tiny model (about 4B parameters): rewrite until a weak reader answers every
  probe correctly on every run, using short sentences, one rule per sentence, and numbered lists for
  order. A weak reader that fails a probe means the document is unclear, not that the reader is bad.
  Before GREEN, scan the complete candidate snapshot produced by `propose`, not the live baseline
  file or only the changed atom. If the candidate has no saved path, pass all of its text to
  `bun <agents-root>/scripts/prose-cues.ts scan -`. Read each marker with the surrounding rule and
  nearby steps. Revise only where context shows padding, repetition, vagueness, or an unsupported
  claim; keep evidence, quotations, command contracts, scope, exceptions, technical precision,
  uncertainty, register, and useful voice. A hit does not imply authorship or alter the score;
  frozen probes and the owner gate decide acceptance.

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

1. **Resolve:** Identify the exact artifact and operation. For no-edit Markdown passes in the review
   set, run `/md-compress guard <absolute-markdown-path>` before reading and require its `guarded`
   receipt. The guard returns `guarded`; read-only review still requires it. For instructions,
   establish the active file, its owner, parent chain, exclusions, and consumers. For a skill,
   resolve its package and linked local prose assets, plus static roots, consumers, ignore scope,
   and adapter. Follow each asset recursively, inventory top-level and nested content, map each
   block to an owner, and record the review set before baseline.
2. **Prepare evidence:** Preserve existing user changes. Resume or prepare the matching review,
   define a non-filler matrix, freeze its fingerprint, record source fingerprints, and run RED
   before editing. Retain exact failures and rationalizations. For instructions, capture the
   authority chain and relevant requirements.
3. **Guard and edit:** Follow the transaction defined by `/md-compress begin` and
   `/md-compress finalize` in Immutable Operational Rules. Keep instruction documents in their
   existing format. For a skill, map ownership and rewrite the full source in place as one cohesive
   seven-section document. Keep invocation grammar in `Usage`, routing rules with their owner, and
   branch or downstream command-information tables in their owning section. Use nested subsections
   where needed; remove superseded blocks.
4. **Check:** Run GREEN against the same matrix and require a changed source fingerprint. Use
   REFACTOR to close new loopholes, then run challenge cases against the same candidate source and
   matrix. For description or body changes that affect activation, run the in-session training loop
   below against `<agents-root>/evals/skills/<skill>/trigger-queries.json`. For output changes,
   compare clean with-skill and without-skill or prior-version runs, grade each assertion with
   evidence, retain timing/token deltas, and manually review outputs. For instructions, review
   precedence, active-path selection, links, cross-file conflicts, and the exact requested rule.
5. **Preflight, record, and react:** Use only owner-script flags; flags never transfer between
   scripts. Finish all authorized source and evaluation-set edits before GPU `record`; a rejection
   can consume a held-out look before reporting other failures.
   - The script owns input checks, answer parsing, measurements, held-out scoring, and receipt
     policy. The agent owns command selection, source verification, failure classification, repair,
     and retry.
   - Run `bun scripts/validate/skills.ts` from `<agents-root>`; require `status: valid` for package
     checks, matrix cases, query-set IDs/counts, and local prose links.
   - Preview `bun scripts/skill-manager/index.ts atoms <agents-root> <owner-id>`; resolve every
     `unresolvedProbes`, rerun with `--write`, record retirement reasons, refresh the fingerprint,
     and require `bun scripts/skill-manager/index.ts audit <agents-root> --check`.
   - If the next distinct text would exceed the held-out look limit, do not run `record` yet. Use a
     fresh session that sees only the current rule atoms, not the candidate diff or failed probes,
     to author a new pool. Add its probes to the set, run `ratchet`, and pass the sealed pool with
     `--rotate-pool` on the next record. Follow [train-protocol.md](references/train-protocol.md).
   - `train measure --track contract --attempt` is separate capped training, not preflight.

   Save complete output and status; never use `exit` or let one failure stop a guarded sequence.
   `ACCEPTED` is the receipt. `REJECTED` and its diagnosis are advisory evidence, never repair
   instructions. The diagnosis is separate from the reader's raw answer and may misstate the source.
   For each miss, compare the probe, expected answer, reader reply, and governing source rule; use
   the diagnosis as evidence, repair the source, then record the changed text. Include the label and
   exact `Answer:` value when checking the raw reply. Never change labels to fit answers; never edit
   a receipt by hand. Never rerun unchanged input. After each repair, rerun the full local
   preflight. Allow up to 5 rewrites; afterward, `record --allow-equal <reason>` is allowed only for
   a never-worse result and cannot override a regression.

   Do not stop the edit. Finish authorized edits and checks despite the missing GPU route, then give
   one exact GPU command for the full batch in a fenced block with its working directory. Save its
   output and status to a unique absolute log path known to the agent. Ask the user to run this one
   command outside the sandbox and signal completion. When they say it is done, read the saved log.
   Never ask them to paste long output. Do not claim the gate passed before checking the log. After
   every target is accepted, run read-only `verify` and the configured final gate once from
   `<agents-root>`:

   ```sh
   log_file='<unique-absolute-log-path-known-to-agent>'
   if bun scripts/instruction-gate/index.ts record '<doc-path>' \
     >"$log_file" 2>&1; then command_status=0; else command_status=$?; fi
   printf 'record exited %s; log: %s\n' "$command_status" "$log_file"
   ```
6. **Finalize:** Check frontmatter, structure, links, resources, and policy inheritance.
   Guard/finalize failure: preserve backup/lock; recover or report exact blocker; no false closure.

If a project gate returns a non-blocked action packet, apply its validated required action groups
through the explicit apply route owned by that command. Verify allowed paths and forbidden actions,
then rerun the identical gate. Never display or hand off a safe packet without applying it. A
missing, blocked, ambiguous, or unsafe packet is a repair stop.

### Review scope, prose, and link integrity

For no-edit Markdown passes in the review set, use `/md-compress guard <absolute-markdown-path>`
before reading and require its `guarded` receipt. Review the target, linked prose, static roots, and
adapter. Read `.agents/.gitignore` first; exclude ignored paths. Include `<project>/AGENTS.md`,
`<coding-assistant>/AGENTS.md`, and `~/.agents/AGENTS.md` when applicable. Verify each child extends
its parent. Every local link must exist in approved scope, identify its owner, and be current;
reject stale, duplicate, or unrelated-router links. Follow the Markdown transaction in Immutable
Operational Rules; guards prove token preservation, not authority or meaning. Deterministic checks
validate JSONL matrices, manifests, and code. Keep concrete project/assistant paths in local policy.

The policy owner remains authoritative for content. A project or assistant path may narrow its own
scope or strengthen its parent, rather than replacing it. Follow explicit runtime precedence when
both a base file and an override exist.

### Evaluation contract

Each `<agents-root>/evals/skills/<skill>/rubric.md` defines machine-readable `schemaVersion`,
`requiredCaseFields`, `requiredVisibility`, `minimumPassRate`, and fixed `verifierIds`. Reject
missing or unknown verifier ids. Run declared verifiers only through the in-process fixed registry;
arbitrary shell commands and descriptive verifier prose are not executable evidence. Candidate and
challenge receipts must show that independent verifiers actually ran.

Use the frozen `<agents-root>/evals/skills/<skill>/cases.jsonl` and, when applicable,
`<agents-root>/evals/skills/<skill>/trigger-queries.json`. Record the matrix fingerprint before RED
and keep it unchanged through candidate and challenge; record source fingerprints for every phase.
**RED** runs without the candidate and preserves exact failures and rationalizations. **GREEN**
applies the smallest repair to the same matrix. **REFACTOR** identifies new rationalizations, adds
targeted counters, and reruns candidate and challenge checks until stable. Choose the guidance form
from baseline evidence: a bright-line rule, counter, and red flag for pressure failures; a positive
recipe or structural contract for wrong shape; and a predicate/action/boundary for conditional
behavior.

For discipline evaluations, use a no-guidance control, at least three combined pressures, 5+
independent samples where supported, manual review of flagged outputs, captured rationalizations,
and variance as a signal. Remove always-pass or always-fail assertions, inspect outliers, and retain
the evidence; scores or measurements do not close a review.

Description evaluations use the fixed train/validation split in
`<agents-root>/evals/skills/<skill>/trigger-queries.json`. Each split needs balanced
`should-trigger` and `should-not-trigger` queries: at least two of each, and no polarity below a
third. `validate` enforces this. Example splits: 3 should-trigger and 6 should-not-trigger passes; 1
and 5 fails, because it has only one should-trigger query; 6 and 1 fails; 2 and 8 fails, because 2
of 10 is below a third.

Run every query repeatedly: five runs by default, three at minimum. Observe trigger rates from the
actual registered agent where available, otherwise from the blind child agents below. A query passes
only when every run agrees with its label:

- A should-trigger query passes when the skill loads in all runs (5 of 5). It fails at 4 of 5.
- A near-miss query passes when the skill loads in no run (0 of 5). It fails at 1 of 5.
- A mixed result is an unstable query to fix, never a pass.

Use held-out validation to choose attempts; do not overfit failed-query keywords.

Scripts used by the workflow must be non-interactive, expose `--help`, and emit structured output.
Errors should say what failed, what was expected, and what the agent should try next.

### In-session training loop

Use each train failure for one guarded edit; prefer the description, changing the body only for
routing. An edit over the cap fails before any write. `--max-body-lines <n>` defaults to 40;
`--max-description-change <percent>` defaults to 25 of the baseline description characters.
`train measure --measure-only` takes `<skill-path> <responses>`; `train measure --attempt` with
`<n>` (`train measure --attempt <n>`) takes `<skill-path> <responses> --attempt <n>`; contract mode
takes `<skill-path> --track contract [--measure-only\|--attempt <n>]`; `train select` accepts
`<skill-path> [--track contract]` reports `decision`, `liveState` (`baseline`, `winner`, `measured`,
`unrecorded`), `nextAction`, and `doNotRetry`. Status uses `train measure --status` with
`<skill-path> <responses> --status <applied\|post-change\|rollback>`; `ratchet` uses
`<previous> <next>`. No responses file is needed for `train measure --track contract`. Document
replies use an `answer` field with one option letter; `clear` means every query passes on every run.
A blocked attempt stores a `rejected` record; its status is `blocked`. Challenge results are counts
only. Never claim completion from a training run without an `accepted` or restored ledger entry;
include the `train select` receipt.

## 6. Output & Completion Contract

Return changed files, active package/policy chain, fingerprints and receipts, transactions, links
and resources, checks, owner review, gates, limits, and handoff. Include skill cohesion; instruction
inheritance and preserved edits; and, for training, ledger ids, snapshots, `train select`, gains and
regressions, ratchet, post-change result, and accepted/restored state.

Report exact failures, owners, missing resources, stale receipts, mismatches, gate output, and
repair actions. Scores and partial passes do not close work; training requires an `accepted` or
restored ledger entry. Use `finalGate` in `aidx.json`, otherwise `.agents`'s `bun run test`,
otherwise `bun run test`; run it fully and retain command/result.

## 7. Evaluation Anchors

- **Canonical:** Skill updates use one frozen matrix, RED/GREEN/REFACTOR, a cohesive seven-section
  rewrite, challenge evidence, deterministic validation, prose review, and the configured gate.
- **Instruction lifecycle:** Policies share owner, evidence, guard, and closeout rules while
  retaining their format and authority.
- **Boundary:** Wrong owner, inactive target, broken inheritance, changed user work, weakened
  assertions or matrices, broken links, missing adapters/resources, stale receipts, ignored
  protected state, detached or filler skill content, or failed gates stop closure; seven headings
  alone prove no cohesion.
- **Training:** `doNotRetry`: rejected attempts of this generation with reason and ids.
- **Challenge:** Preserve uncertainty and delegated judgment; do not impose brittle exact-output
  behavior on skills or instructions that require research, interaction, or owner decisions.
- **Independent verifier:** Quality-engine receipts, deterministic checks, matrix/source
  fingerprints, Markdown token checks, policy and link review, and project gates verify closure.
