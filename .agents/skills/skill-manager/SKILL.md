---
name: skill-manager
description: Create, update, review, rename, synchronize, optimize, validate, or repair any agent skill through an evidence-gated process with clear trigger boundaries, reusable references, deterministic scaffolding, frozen quality matrices, lossless Markdown protection, and targeted validation.
---

# Skill Manager — Create, Maintain, and Govern Skills

## 1. Role & Scope

Skill Manager is the sole owner of every skill lifecycle request: create,
update, review, rename, synchronize, optimize, validate, or repair a skill,
including AIDX and specialized capability skills. It owns the selected
package's frontmatter, normal path, router, delegated owners, references,
assets, matrices, prose/link review, validation, and closeout evidence. Domain
skills may supply knowledge or execute delegated work, but they do not mutate
skill packages.

The `quality-engine` owns evaluation state and receipts; Skill Manager owns the
skill contract, resources, references, matrices, repair packet, and final
changed-file/evidence handoff. Read [skill-lifecycle.md](references/skill-lifecycle.md)
for the method, [skill-template.md](references/skill-template.md) for the
shared six-part contract, and [index.md](references/index.md) for the map.

## 2. Immutable Operational Rules

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
- Treat the six headings as the document architecture, not as a wrapper. For
  an existing skill, make a content-ownership map first, then rewrite the
  entire source in place: move every retained paragraph, table, code block,
  and branch rule into one owning section or nested subsection and remove
  superseded blocks. Never prepend a six-section shell over the old skill,
  append the old body after section 6, duplicate a command catalog, or add
  filler to satisfy the heading count. Sections need not have equal length.
- Never claim closure from a score or measurement. Deterministic validation,
  prose/link review, matrix receipts, project gates, and owner review decide
  pass/failure.

## 3. Input & Context Schema

- **Required:** An absolute skill path or static root, the lifecycle operation,
  and the applicable matrix/eval assets.
- **Optional:** Additional static roots, review id, candidate/challenge phase,
  delegated receipt, or a forward-test request.
- **Context:** Frontmatter, all canonical and linked durable Markdown, scripts,
  assets, eval matrices/rubrics, local links, static consumers, ignore rules,
  runtime adapters, existing user changes, and configured gates.
- **Unknowns:** Missing owner/source/matrix/verifier, invalid scope, stale link,
  missing resource, unresolved adapter, or unclear completion proof is a repair
  or clarification stop. Do not invent a score, provider, credential, or
  evidence.
- **Existing-document migration:** Record a content-ownership map before
  editing. Each retained block must have one of the six section owners or an
  explicitly linked reference; mark obsolete blocks for removal rather than
  carrying them forward as a detached second half.

For global `.agents` review, read `.agents/.gitignore` before inventorying the
review set. Exclude every ignored path and machine-local runtime/coverage
state; include every non-ignored declared static path. If a role-based adapter
exists at `<runtime-home>/AGENTS.md`, review it as an **additional static root**.

## 4. Ordered Execution Chain

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
   using the six headings as the real document structure. Rewrite the complete
   `SKILL.md` in place; put command tables, routers, and branch rules inside
   the section that owns them, use nested subsections when needed, and remove
   superseded or duplicate legacy prose.
4. **Evaluate:** Run GREEN against the **same matrix**, require a changed
   **source fingerprint**, then run REFACTOR to close new loopholes. Issue
   challenge evidence only from the same candidate source and matrix.
5. **Finalize and gate:** Run each returned Markdown finalize action, validate
   frontmatter/structure/resources, review prose and links, run applicable
   candidate/challenge checks and project gates, then return the changed-file
   handoff or a targeted repair packet.

### Command catalog

The script below owns command grammar. Matrix JSONL artifacts are temporary
inputs under the operating system temporary directory.

| Priority | When | Command | Result and next action |
| --- | --- | --- | --- |
| 1 | New authorized package with known path | `bun <agents-root>/scripts/skill-manager.ts init <absolute-skill-path> <description>` | Creates one non-overwriting scaffold; fill its real contract, then validate. |
| 2 | Structural frontmatter/update validation | `bun <agents-root>/scripts/skill-manager.ts validate <absolute-skill-path>` | Validates name, description, instructions, and directory; then review and matrix-check. |
| 3 | Selected skill/static-root integrity review | `bun <agents-root>/scripts/skill-manager.ts review "<absolute-skill-or-static-root-path>" ["<absolute-additional-static-root-path>"]` | Returns recursive prose inventory, ignored paths, and local-link findings; repair owners then rerun. |
| 4 | One baseline/candidate/challenge evaluation | `bun <agents-root>/scripts/skill-manager.ts evaluate "<baseline-or-candidate-or-challenge>" "<absolute-matrix-jsonl-path>" "<absolute-skill-file-path>"` | Returns one matrix receipt; use the state-derived next action. |
| 5 | Two or more independent evaluation targets | `bun <agents-root>/scripts/skill-manager.ts batch "<review-id>" "baseline" "<absolute-first-matrix-jsonl-path>" "<absolute-first-skill-file-path>" "<absolute-second-matrix-jsonl-path>" "<absolute-second-skill-file-path>"` | Runs bounded receipts; use `candidate` for the next compatible phase. |
| 6 | State-derived repair handoff | `bun <agents-root>/scripts/skill-manager.ts packet "<review-id>" "<candidate-checked-or-candidate-requested-or-draft>" "<absolute-skill-path>"` | Returns the required action packet; follow it and do not invent assertions. |
| 7 | Global deterministic validation | `bun <agents-root>/scripts/validate-skills.ts` | Validates every local skill, rubric, matrix, frontmatter, ignored scope, and prose link. |

### Router governance

This is the owner rule for caller-owned selection. A router belongs in the caller
that selects the next command or information. It must use this exact table shape
and ordered rows:

| Command or information | Arguments | When to use | Additional information |
| --- | --- | --- | --- |

Required arguments use `<name>`, optional arguments use `[name]`, and no
arguments use `—`. Do not use ellipses, ambiguous shorthand, hardcoded
examples, or a second command catalog. Order normal calls first, alternatives
at their shared decision point, and recovery after normal choices. Each row has
one observable condition, one action/source, and the canonical owner.

The reusable contract names its slots as `Role & Scope`,
`Immutable Operational Rules`, `Input & Context Schema`,
`Ordered Execution Chain`, `Output & Completion Contract`, and
`Evaluation Anchors`. The command owner exposes `init`, `validate`, and
`review`; its paired candidate invocation is the inline command
`bun <agents-root>/scripts/skill-manager.ts batch "<review-id>" "candidate" "<absolute-first-matrix-jsonl-path>" "<absolute-first-skill-file-path>" "<absolute-second-matrix-jsonl-path>" "<absolute-second-skill-file-path>"`:

```text
bun <agents-root>/scripts/skill-manager.ts batch "<review-id>" "candidate" "<absolute-first-matrix-jsonl-path>" "<absolute-first-skill-file-path>" "<absolute-second-matrix-jsonl-path>" "<absolute-second-skill-file-path>"
```

### Matrix, RED/GREEN/REFACTOR, and pressure evidence

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

### Review scope, prose, and link integrity

The review set is `SKILL.md`, every linked local prose asset, every
declared static methodology root, and the applicable adapter. Verify each
linked local prose asset exists inside approved scope, names the intended owner,
and is not stale, duplicated, or redirected through an unrelated router.
Review every durable Markdown file with `/md-compress`, even when unchanged;
that transaction proves token preservation but does not replace the prose,
authority, or link review. JSONL matrices, manifests, and source code remain
separate deterministic artifacts.

### Runtime adapters and cross-surface ownership

When a role-based adapter exists, include `<runtime-home>/AGENTS.md` as an
additional static root. It must state that it extends
`<universal-policy-root>/AGENTS.md` and **does not replace** the **parent
policy**. Keep reusable guidance placeholder-based with `<coding-assistant>`,
`<runtime-home>`, and `<universal-policy-root>`; when **materializing a
concrete adapter**, replace those placeholders with the **actual runtime
identity** in that adapter only. A runtime-specific adapter is not a second
skill or parent owner.

### Machine-evaluated rubric and verifier contract

Every `evals/rubric.md` has machine-readable `schemaVersion`,
`requiredCaseFields`, `requiredVisibility`, `minimumPassRate`, and fixed
`verifierIds`. The evaluator rejects missing/unknown verifier IDs and runs each
declared verifier through the in-process fixed registry; arbitrary shell
commands or descriptive verifier prose are not executable evidence. Candidate
and challenge receipts include executed independent-verifier checks.

## 5. Output & Completion Contract

Success returns a valid package, reviewed scope, matrix fingerprint, baseline/
candidate/challenge source fingerprints, changed files, Markdown transaction
receipts, frontmatter/resource/link findings, deterministic validation, owner
review, project gate results, limitations, and a final handoff. The cohesion
review must show that the six headings contain the migrated contract, every
retained block has one owner, no detached second half remains, and heading
count was not achieved with filler. The global
`.agents` `test:lint` gate remains one distinct checker alongside Biome and
declaration-order; all configured gates must pass.

Failure returns the exact finding, failed assertion, owner boundary, missing
resource/link, matrix/source mismatch, or gate output plus the repair packet.
No score, measurement, intention, candidate receipt, or partial green check
closes the review. Do not use provider-driven training or an unavailable
external owner as a hidden dependency.

## 6. Evaluation Anchors

- **Canonical:** A skill update resumes a review, freezes a matrix, runs RED,
  maps existing content, guards Markdown, rewrites one cohesive six-section
  candidate, runs GREEN and REFACTOR, challenges the same source/matrix,
  validates, reviews, and gates.
- **Boundary:** Wrong owner, weakened assertion, broken link, ignored runtime
  state, missing adapter/resource, stale receipt, detached second half,
  filler, or failed deterministic gate stops closure. A six-heading count alone
  is not proof of cohesion.
- **Challenge:** A skill requiring judgment, research, interaction, or
  delegation keeps uncertainty and ownership inside the six sections rather
  than imposing a robotic exact-output persona.
- **Independent verifier:** The `quality-engine`, deterministic validator,
  matrix/source fingerprints, Markdown protection, prose/link review, and
  project gates independently verify closure.
