---
name: skill-manager
description: Create, update, review, rename, synchronize, optimize, validate, or repair any agent skill through an evidence-gated process with clear trigger boundaries, reusable references, deterministic scaffolding, frozen quality matrices, lossless Markdown protection, and targeted validation.
---

# Skill Manager — Create, Maintain, and Govern Skills

Use this skill as the sole owner for any skill lifecycle request: create a new
skill, update an existing skill, rename or synchronize a skill, review its
quality, optimize its context cost, or repair a failed validation. It manages
every skill, including AIDX and specialized capability skills. Do not route
skill creation or maintenance to another skill.

The generic `quality-engine` owns evaluation state and receipts. Skill
Manager owns the selected skill's contract, resources, references, matrices,
prose review, deterministic validation, and repair packet.

## Ownership boundary

Skill Manager owns the complete lifecycle:

- trigger description and frontmatter contract;
- `SKILL.md` normal path, router, delegated owners, and completion proof;
- bundled references, scripts, assets, and folder maps that the skill declares;
- create/update/rename decisions and scope control;
- quality matrices, integrity review, validation, and forward-testing; and
- final changed-file, test, limitation, and handoff evidence.

Other skills may provide domain knowledge or execute a delegated operation,
but they do not create, update, or validate the skill package itself.

Read [skill-lifecycle.md](references/skill-lifecycle.md) for the create and
update method. Read [index.md](references/index.md) for the reference map.

The script below owns the command grammar. Matrix JSONL artifacts are temporary
inputs and must use the operating system temporary directory.

## Skill quality contract

Make the skill predictable for both model and user invocation. Its description
must state the job and distinct trigger conditions; the workflow must name one
owner for each command or information path and must not duplicate a router
owned elsewhere.

Keep information in this order: inline steps for the normal path, one local
reference for branch-only detail, and external sources only for discovery or
authority that cannot be co-located. Split guidance only when invocation or
sequence is genuinely independent. Co-locate the rule, caveat, and checkable
completion condition with the step that needs them.

Before baseline evaluation, freeze a non-filler matrix. Each case needs typed
assertions, a failure mode, a repair boundary, and an independent verifier.
Evaluate baseline, candidate, and challenge behavior when the selected packet
requires it. Do not remove or weaken a failed assertion, and never treat a
green score or measurement receipt as closure proof. A clean review must name
the reviewed scope and checks.

Prune duplicate, stale, no-op, sediment, and speculative guidance. Review for
premature completion, duplication, sprawl, and negation-only instructions:
state the positive target and the hard guardrail together. If a proposed split
does not improve invocation or completion predictability, keep one owner and
remove the split.

## Command catalog

| Priority | When | Command | Result | Next |
| --- | --- | --- | --- | --- |
| 1 | A new skill package is authorized and its path is known. | `bun <agents-root>/scripts/skill-manager.ts init <absolute-skill-path> <description>` | Creates one non-overwriting `SKILL.md` scaffold. | Fill the contract and resources, then validate. |
| 2 | A skill package needs structural frontmatter validation. | `bun <agents-root>/scripts/skill-manager.ts validate <absolute-skill-path>` | Validates name, description, instructions, and directory naming. | Run `review`, then the selected matrix. |
| 3 | A selected skill and its static roots need integrity review. | `bun <agents-root>/scripts/skill-manager.ts review "<absolute-skill-or-static-root-path>" ["<absolute-additional-static-root-path>"]` | Recursive prose inventory, ignore record, and local-link findings. | Repair each finding in its owning file, then rerun. |
| 4 | One selected skill needs a baseline, candidate repair, or challenge evaluation. | `bun <agents-root>/scripts/skill-manager.ts evaluate "<baseline-or-candidate-or-challenge>" "<absolute-matrix-jsonl-path>" "<absolute-skill-file-path>"` | One evaluation receipt. | Apply only the returned repair packet. |
| 5 | Two independent skills need the same evaluation phase. | `bun <agents-root>/scripts/skill-manager.ts batch "<review-id>" "baseline" "<absolute-first-matrix-jsonl-path>" "<absolute-first-skill-file-path>" "<absolute-second-matrix-jsonl-path>" "<absolute-second-skill-file-path>"` | Concurrent receipts and candidate challenges after all candidates pass. | Apply only returned targeted repair packets. |
| 6 | Two independent skills need candidate evaluation. | `bun <agents-root>/scripts/skill-manager.ts batch "<review-id>" "candidate" "<absolute-first-matrix-jsonl-path>" "<absolute-first-skill-file-path>" "<absolute-second-matrix-jsonl-path>" "<absolute-second-skill-file-path>"` | Concurrent candidate receipts and challenge results after every candidate passes. | Apply only returned targeted repair packets. |
| 7 | A script-produced packet requests a draft or repair handoff. | `bun <agents-root>/scripts/skill-manager.ts packet "<review-id>" "<candidate-checked-or-candidate-requested-or-draft>" "<absolute-skill-path>"` | One state-derived action packet. | Follow that packet; do not invent an assertion result. |
| 8 | The global skill package needs its deterministic lint contract. | `bun <agents-root>/scripts/validate-skills.ts` | Validates every local skill, rubric, candidate/challenge matrix, frontmatter, and ignore-aware prose link scope. | Repair all reported skill-owned failures, then rerun once. |

`init` and `validate` are the deterministic skill-creation and skill-update
support that callers use instead of a separate skill-authoring route. The LLM
still owns domain judgment, wording, resource selection, and user questions.

## Create and update contract

For a new skill, first establish the trigger examples, outcome, owner, scope,
and runtime location. Then use `init`, write the minimal normal path, add only
resources that improve completion predictability, freeze the quality matrix,
and validate the package. Do not create provider-specific metadata unless the
runtime explicitly requires it.

For an existing skill, read the current package and its local instructions,
record the requested behavior change, identify affected owners and consumers,
preserve unrelated user changes, and update only the approved surface. A
rename or split must include a link and trigger migration plan; do not leave a
second router or stale duplicate skill behind. Do not create a second router.

Every create or update must finish with `validate`, `review`, the applicable
quality matrix, and project-appropriate type, lint, or test checks. Use
`/md-compress` begin/finalize for every durable Markdown file in the review
set before and after prose edits. Forward-test a complex skill on a realistic
task from a clean context; treat the raw output and emitted artifacts as
evidence, not as proof supplied by the test prompt.

The global `.agents` `test:lint` runs this all-skill validator as one distinct
checker alongside Biome and declaration-order. It is deterministic: it does
not ask an LLM to judge prose quality, and it fails when any local skill lacks
the required assets or when any candidate/challenge assertion, frontmatter, or
link-scope check fails.

## Router governance

Skill Manager governs every router in a skill and its static owned assets,
including lifecycle lanes and static methodology assets. It does not govern
transient evaluation state under the operating-system temporary directory.

A router belongs in the caller that selects the next command or information.
Place a compact router in that caller's `SKILL.md`. Create a separate reference
only when it cannot remain compact, and make the caller link to its one owner.
Do not turn an adoption ledger, evaluation matrix, intent, or historical review
artifact into a durable router.

Every router uses this exact structure and ordered rows:

| Command or information | Arguments | When to use | Additional information |
| --- | --- | --- | --- |

- Write required arguments as `<name>`, optional arguments as `[name]`, and
  `—` when none apply. Do not use ellipses or ambiguous shorthand.
- Order normal calls first in their actual call sequence. Keep alternatives at
  the decision point they share and order recovery paths after normal choices.
- Give each row one observable condition, one unambiguous action or information
  source, and the canonical owner when grammar or implementation lives elsewhere.
- Keep command grammar in its typed or script owner; a router selects it and
  does not restate a second command catalog. Do not use hardcoded examples,
  user-specific values, or illustrative fake commands.
- During review, verify owner, argument notation, ordering, selection condition,
  link target, and that every static consumer reaches the router through its
  caller rather than an unrelated global file.

## Cross-surface adapters

When a runtime has a role-based adapter at `<runtime-home>/AGENTS.md`, include
that file as an additional static root when reviewing the global skill's
instructions. The adapter should state that it extends
`<universal-policy-root>/AGENTS.md` and does not replace the parent policy.
Review the adapter for runtime-specific constraints, stale duplicated rules,
and conflicts with the canonical runtime owner; do not treat it as a second
skill or as the runtime's parent policy.

Use role placeholders such as `<coding-assistant>`, `<runtime-home>`, and
`<universal-policy-root>` in reusable guidance. Never hardcode a concrete
assistant, vendor, product, or installation path when describing this pattern.
When materializing a concrete adapter, replace those placeholders with the
actual runtime identity and path in that adapter only. Keep the reusable skill,
rubric, and other templates placeholder-based.

## Review scope, prose, and link integrity

Skill Manager owns the complete review surface for a selected skill: its
`SKILL.md`, every linked local prose asset, and every named static asset root
that the skill declares as part of its methodology. Prose includes durable
Markdown and any non-code text whose wording guides behavior; JSONL evaluation
matrices, manifests, and source code remain separate deterministic artifacts.

Build the review set before baseline. Follow local links recursively from
`SKILL.md`, record each resolved source, and include each declared ancillary
static root. For every local Markdown link, verify that the target exists, is
inside the approved scope, names the intended owner or information, and is not
stale, duplicated, or redirected through an unrelated router. Treat a missing
or wrong-owner link as a repair finding, not as an optional documentation note.
Use the Priority 5 receipt for the deterministic inventory, ignore filtering,
and actual local-link checks; review path-like prose references against their
declared path basis as part of the human authority and clarity review.

For global `.agents` work, read `.agents/.gitignore` before inventorying the
review set. Exclude every ignored path and include every non-ignored static
path. Exclude machine-local indexed runtime directories and coverage. Do not
use ignored state as review evidence or edit it unless the user explicitly
names it.

Review every in-scope durable Markdown file for clarity, non-redundancy,
authority, and link integrity. Run the direct `/md-compress` begin/finalize
transaction for each one—even when no wording change is necessary—to preserve
lossless-token evidence. A successful transaction proves preservation, not that
the prose review can be skipped.

1. Resume or prepare one matching review run before any edit.
2. Define a non-filler matrix. Every case needs typed assertions, failure mode,
   repair boundary, and an independent verifier. Freeze it before baseline.
3. For two independent skills, use Priority 2. It reads and evaluates both
   pairs concurrently in one response. For one skill or a targeted failed
   repair, use Priority 1 or Priority 4; those commands are not dead code.
4. Before prose-editing any durable Markdown in the frozen review set, invoke
   the direct `/md-compress` transaction and follow its returned finalize action.
   Run that transaction for all in-scope durable Markdown, including unchanged
   files. Temporary JSONL matrices and generated receipts are exempt.
5. Complete every compatible action group in one minimal candidate batch. Do
   not alter the frozen matrix, skip an action ID, expand scope, or claim pass.
6. For two independent candidates, use Priority 3. It evaluates both
   candidates concurrently, runs challenges only after every candidate passes,
   and returns targeted repair packets when a candidate or challenge fails. The
   controller accepts only this script-produced receipt. For one selected skill,
   use Priority 1.

Ask all unresolved material questions together when the packet permits no safe
candidate batch. Never invent a score, provider, credential, or evidence. A
challenge result is not a security boundary; it is simply not issued in the
candidate packet.

## Machine-evaluated rubric and verifier contract

Every evals/rubric.md must contain the machine-readable schemaVersion, requiredCaseFields, requiredVisibility, minimumPassRate, and fixed verifierIds frontmatter. Human rubric prose remains useful context, but it is not acceptance evidence by itself. The evaluator must parse this contract, reject missing or unknown verifier IDs, and execute each declared verifier through the in-process fixed registry. No arbitrary shell command or descriptive verifier text is accepted as execution.

The reusable evaluator engine lives under utils/quality-engine. Its state, packet, receipt, matrix, and bounded batch behavior remain one coherent unit; do not split or redesign it while changing the package name. Use runBatched for bounded read-only batch work, reject duplicate normalized queries, and keep exclusive work serial. Candidate and challenge receipts must include the executed independent-verifier checks.
