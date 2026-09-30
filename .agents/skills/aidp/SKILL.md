---
name: aidp
description: "Turn a user request into one explicit six-section execution plan and hand it to /aidx."
argument-hint: "<goal-and-concerns>"
---

# AIDP — Architect of Execution

## 1. Role and scope

AIDP owns clarification, evidence intake, and materialization of one execution
plan. The user request is the starting hypothesis, not a complete
specification: it may be comprehensive or only an incomplete sentence. AIDP
must enrich it with implementation evidence, business context, and explicit
user decisions before it writes the plan. It does not implement source
changes, execute the plan, or maintain a second workflow. Its handoff is one
durable Markdown plan followed by a clickable plan link and one `/aidx` command.

### Trigger and accepted input

**Trigger:** The user invokes `/aidp` with a request, partial request, or
supporting context. AIDP accepts only that request/context; it does not accept
a plan path or implementation arguments.

## 2. Usage

```text
/aidp <goal-and-concerns> # turn a request into one explicit execution plan
```

The unannotated grammar is:

```text
/aidp <goal-and-concerns>
```

Required:

- `<goal-and-concerns>`: the user's request and any supplied context to turn
  into one execution plan.

`/aidp` is an agent workflow, not a terminal command. It returns one plan path
and the `/aidx` handoff command.

## 3. Immutable Operational Rules

Load [the engineering planning contract](references/engineering-planning-contract.md)
before decomposition. It supplies observed-language routing, role ownership,
work-packet records, and UI/NFR/security/brownfield obligations without
depending on another skill tree.

The owner file must advertise these routes directly.

### Minimal-plan discipline

Before decomposing work, question whether the requested change needs to exist
or is already covered by the current project. When the need is speculative,
surface that decision and do not manufacture a plan. For work that remains,
prefer the smallest compatible change and an existing extension point, then the
standard library, native platform capability, or an already-installed
dependency before proposing custom code. Do not add abstractions, boilerplate,
scaffolding, or configuration for later. Record a deliberate simplification,
its known ceiling, and the condition that would justify expanding it.

This complete discipline is always active; AIDP has no mode selector. Never
plan away explicitly required validation, error handling, security,
accessibility, compatibility, or other safety and quality obligations.

### Conditional decision-quality pass

For a material plan with competing paths, unclear selection criteria,
fallback or adapter growth, duplicate ownership, or architecture-direction
risk, run one compact decision-quality pass before decomposition. Record:

```text
First Principle: the irreducible outcome the plan must satisfy.
Non-negotiables: constraints the plan cannot break.
Assumptions to Drop: inherited habits or unverified preferences.
Smallest Sufficient Path: the least-complex stable path that satisfies the outcome.
Escalation Signal: the finding that requires a product, design, architecture, or user decision.
```

For an owner or boundary risk, extend the pass with an Architecture Integrity
check: invariant, canonical owner / contract, responsibility overlap,
higher-level simplification, retirement trigger / falsifier, and a verdict.
Use this to test whether a locally convenient fallback, adapter, or duplicate
owner belongs at a higher-level source of truth. Keep simple, clearly bounded
work on the fast path; do not add ceremony when the pass would not change the
decision surface. This pass is advisory and does not replace clarification,
approval, plan validation, execution, or the configured final gate.

### Observed-language routing

Read common rules first,
then select an observed profile such as PHP, TypeScript, React, or Web/HTML/CSS;
route relevant work through the following.

### Role routing

Use Product, Architect, Developer, Quality, Security,
Design, and Delivery; and create Research record, Requirements record, Design
record, Units record, and Delivery record before handoff. The linked contract
contains the full obligations and migration map.

The active package is self-contained. Runtime scripts and duplicated lifecycle
machinery from the source material are not copied. See the Source migration map;
reusable engineering
contracts are retained in the owned reference above.

Read the user's request and explicitly supplied material. Resolve the intended
project root before choosing the plan path. Use `/repo-search` with the
absolute project root and the request-derived query; the caller does not
calculate or provide an index. Use `/knowledge-base` for the configured
private-KB root and resolved project scope. Retrieve private context through
`/knowledge-base` before asking the user anything. Record both returned receipts and
the observed facts, evidence limits, and unresolved decisions before asking
the user anything.

### Context retrieval command options

Use the owner command contracts below. Do not calculate an index, substitute a
different search command, or treat a missing result as an answer.

| Command or information | Arguments | When to use | Additional information |
| --- | --- | --- | --- |
| `/repo-search` path search | `<approved-root>` `<query>` | Every request, before clarification | `bun <agents-root>/scripts/repo-search.ts "<approved-root>" "<query>"`; returns repository/code evidence and one ordered receipt while hiding index selection and fallback details. |
| `/repo-search` indexed inspection | `<approved-root>` `<absolute-jsonl-request-path-under-os-tempdir>` | When several independent implementation reads are needed for one decision | `bun <agents-root>/scripts/repo-search.ts inspect "<approved-root>" "<absolute-jsonl-request-path-under-os-tempdir>"`; use only the owner-defined JSONL operations and preserve its receipt. |
| `/knowledge-base` search | `<private-kb-root>` `<repo-search-index>` `<query>` | Every request, before clarification | `bun <agents-root>/scripts/knowledge-base.ts search "<private-kb-root>" "<repo-search-index>" "<query>"`; returns validated business-context concepts plus discovery and fallback receipts. |

Repository evidence answers what exists and how the implementation is
structured. Private knowledge answers the applicable business intent,
constraints, terminology, ownership, and precedent. AIDP combines both with
the request, labels conflicts and gaps, and asks the user for decisions that
the evidence cannot establish.

Use this evidence order: current user request, applicable project instructions,
verified repository or file evidence, validated private knowledge, then clearly
labelled assumptions. A project convention is not a universal rule, and a
missing knowledge result is not permission to invent one. For brownfield work,
record the current behavior, entry path, owner, consumers, data or protocol
boundaries, existing proof, compatibility constraints, and uncertainty before
decomposing a change.

Resolve the plan root from the active AIDP skill location, never from the
repo-search index. The directory containing this `SKILL.md` is the active
skill directory; walk upward through its `skills` directory to resolve
`<agents-root>`, the containing `.agents` directory. The canonical plan path
is then
`<agents-root>/plans/<repo-search-index>/<summary-slug-160-chars>.md`.
Treat `<repo-search-index>` as data and exactly one safe path segment inside
that already-resolved `<agents-root>` path. Never use any token, prefix, or
apparent repository name in the index to replace or refine `<agents-root>`.

Before writing, verify that the absolute destination is below the resolved
`<agents-root>/plans/` directory and that its index directory is exactly
`<repo-search-index>`. If the skill location, containing `.agents` directory,
or destination relationship cannot be established, stop instead of deriving a
project path from the index or writing a partial plan. The slug is stable,
descriptive, and no longer than 160 characters. If a requirement could change
scope, ownership, safety, architecture, or acceptance, stop for a focused
clarification; do not guess and do not write a partial plan.

## No-Assumption Covenant

This covenant is absolute and overrides every other instruction in this skill.
AIDP never fills a material unknown with a plausible default, an inferred
preference, a project convention not in evidence, a framework's "usual" shape,
or a silent branch. A plan that contains an unflagged assumption is invalid and
must not be handed off.

### What counts as an assumption

Any of the following, when the user has not explicitly decided it and verified
evidence has not established it, is a forbidden assumption:

- A scope, ownership, or boundary the user did not confirm.
- A framework, library, command, gate string, or API shape inferred from "how
  these projects usually work" rather than verified against the repo or
  `package.json`.
- A voice, tone, density target, or content rule inferred from prior sessions
  without a returned `/knowledge-base` receipt proving it applies here.
- A fix for a quote, citation, anchor, or doctrinal claim the canonical
  patterns do not cover.
- A conditional branch silently treated as completed or as an unmet
  prerequisite.

### The only allowed fill-ins

The only values AIDP may write without a user decision are:

- Values returned by `/repo-search` or `/knowledge-base` receipts, cited with
  the receipt path.
- Values the user typed in this turn or a prior turn of this session, quoted.
- A labelled, explicit `assumption:` marker used only to *flag* an assumption
  for the user — but a flagged assumption never satisfies a requirement; it is
  a clarification stop, not a resolution.

### Mechanical enforcement

The plan author and the validator enforce this mechanically as well as in prose:

- Every workflow step that asserts a user decision MUST carry a `decision:` or
  `clarified:` marker followed by the decision text or the user's quoted
  answer. A step asserting a decision without the marker fails validation.
- The validator scans every section for assumption-smell phrases (`assume`,
  `should probably`, `likely`, `presumably`, `default to`,
  `I will`, `we will`, `typical`, `usually`, `standard`, `by convention`) and
  fails any hit that is NOT adjacent to a `decision:`, `clarified:`,
  `assumption:` (flag-only), or evidence-cited marker. Smell without an
  adjacent marker is treated as an unflagged assumption.
- A plan written while a material ambiguity remains is rejected, even if it
  parses cleanly. The validator's no-assumption pass is structural, not
  semantic; the skill authoring rule is stronger: **if you are unsure, you
  ask; you never write.**

### Ask order

Retrieve evidence first (`/repo-search`, `/knowledge-base`), then ask one
material question at a time. State what decision each answer unlocks and the
smallest consequence of each answer. Do not bundle questions. Do not write the
plan until every material question is answered and every assumption is either
resolved by evidence or explicitly flagged as an open clarification stop that
the user has seen. A user preference is not a requirement until the user
decides it.

## 4. Input & Context Schema

The plan body has exactly one level-one heading (H1) followed by exactly these
six numbered level-two sections, in this order. A Markdown document has exactly
one H1; the six sections are H2 under it.

**The document H1 must equal the frontmatter `title` verbatim.** It is written
as `# <title-from-frontmatter>` on the first line after the YAML frontmatter.
The validator rejects any plan whose H1 text differs from the frontmatter
`title` (whitespace-trimmed); the two are one fact in two surfaces and must not
drift.

**Heading level is fixed:** the six sections are written `## 1. TARGET DIRECTIVES`
through `## 6. RIGID OUTPUT SCHEMA` (H2, numbered, the numeral then a period
then a space then the all-caps title). Do not use H1, H3, or unnumbered forms
for these sections; do not add other H1/H2 headings to the body. Headings must
match the forms below; do not use aliases.

### 1. TARGET DIRECTIVES

State one objective and explicit scope boundaries, exclusions, and ownership.

The singular ownership named in this block is the **human owner** (final
decision-maker — the user who invoked AIDP). The AIDP planning skill that
is running in the current turn is the **plan author**; the AIDX execution
skill that consumes the materialized plan via `/aidx` is the **executor**.
The human owner, the plan author, and the executor are three distinct
identities. Conflating them pollutes every workflow step with redundant
attribution. Establish them exactly once here, in TARGET DIRECTIVES,
under an **Agent Role / Human Owner / Authority & Escalation** block.
Do not paste `owner: AIDX` on every workflow step; the per-step field is
`responsibility` (see the chronological-workflow paragraph below), and
it names the executor role that consumes the plan, not the plan author.

The Agent Role / Human Owner / Authority & Escalation block has this
shape; do not invent an alternative shape, and do not omit any of the
four sub-bullets when the plan crosses a project, brownfield, or
cross-cutting boundary:

- **Agent Role (Identity).** Name the plan author (the AIDP skill
  running in this turn) and explicitly state that the AIDP skill does
  NOT execute the plan; AIDP produces one durable Markdown plan and a
  `/aidx` handoff. The executor of every workflow step is the AIDX
  skill invoked with this plan's path.
- **Human Owner (Final Decision-Maker).** Name the human owner (the
  user). The human owner reviews each AIDX pass result, may veto any
  rewrite decision, may add new learnings from prior sessions, and is
  the only authority on scope, voice, or surface changes that affect
  the public site.
- **Authority & Escalation.** Enumerate the conditions under which the
  AIDX executor escalates to the human owner. Each condition names
  what AIDX pauses on, what it captures into the scratchpad, and the
  question or option it surfaces. Typical conditions: a quote with a
  fix-eligible error and no clear correction; a new citation that
  cannot be verified; a long page that cannot be cleanly split; a
  strict-mode build failure whose fix requires a scope decision; any
  banned word or factual claim the canonical patterns do not cover.
- **Configured Final Gate.** Verify the final-gate command string
  against the project's `package.json` or `aidx.json` BEFORE writing
  the plan; the gate is `bun run test` (the agents-root default) when
  no project override exists, otherwise it is `aidx.json`'s
  `finalGate`, otherwise the configured project gate. For npm-based
  projects the equivalent is `npm run test && npm run test:e2e` (or
  whichever string the project's `test` and `test:e2e` scripts
  compose). Do NOT invent a plausible-looking chain such as
  `npm run test:lint && npm run test:unit && npm run test:e2e &&
  npm run build` — that string is wrong on most projects; verify
  first, then name the gate.
- **Pre-gate sanitizer step (mandatory).** The CHRONOLOGICAL WORKFLOW
  must end with one executable `- [ ]` step that runs the
  hidden-character sanitizer over the working tree immediately before
  the final-gate step, and never on the gate itself:

  ```text
  - [ ] Preview the hidden-character sanitizer over the workspace before the final gate:
        `bun <agents-root>/scripts/sanitize-hidden.ts .` (a dry run; it never writes).
  - [ ] Review the preview, then apply it once with `--write`:
        `bun <agents-root>/scripts/sanitize-hidden.ts . --write`, then re-diff.
  ```

  This strips zero-width/soft-hyphen characters, BOM, non-breaking and weird 
  dashes (to ASCII "-"), and stale control bytes from every text file 
  recursively, in parallel, skipping `.git`, `build`, `coverage`, 
  `node_modules`, `playwright`, and binary extensions. A plan that omits 
  this step is incomplete and must not be handed off. Never pass `--write` without reviewing
  the dry-run first: the write pass rewrites files in place and cannot be undone. Binary
  content (a NUL byte or invalid UTF-8) is skipped by byte content.

### 2. VARIABLE DEFINITION MATRIX

List every required path, value, source fragment, and dependency with its
strict expected type and whether it is required or optional.

### 3. CHRONOLOGICAL WORKFLOW

Give concrete ingest-and-verify, process-and-transform, and synthesize steps.
Each step names one target, responsibility, dependency, reason, expected
result, preserved behavior, failure or boundary case, and focused proof. Each
step is independently testable and MUST be written as an unchecked Markdown
task item beginning `- [ ]`. These `[ ]` items are the execution checklist
that AIDX must update; do not use prose-only steps or pre-mark them complete.
For material work, decompose only after the
requirements and design decisions are explicit; identify the smallest units,
their dependency order, and the fact that would require re-planning.

The per-step responsibility field names the executor role that will
carry out the step (typically the AIDX execution skill or a delegated
router). It is NOT a re-statement of the singular owner established in
TARGET DIRECTIVES. Do not paste `(owner: AIDX)` (or any other executor
attribution) on every step — that is noise and confuses the
plan-author / executor / human-owner split. Write the responsibility
field only when the executor for a step deviates from the default
AIDX executor (for example, when a step escalates to the human owner
or delegates to a different skill).

### 4. TOOL STRATEGY & FALLBACKS

Name the primary method, its owner, its exact input boundary, and one concrete
fallback for empty or failed results. Do not invent an unowned router.

### 5. SYSTEMATIC VERIFICATION CHECKLIST

Map checks to the objective, variables, workflow results, exclusions, and
failure states. A null, missing, ambiguous, unsafe, or unverifiable required
input must stop the plan.

### 6. RIGID OUTPUT SCHEMA

Specify the exact labels, ordering, delimiters, required values, and omission
rules for AIDX's final response.

### Plan authoring skeleton

Materialize the plan with exactly this frontmatter shape before the document
H1 and the six H2 sections. Replace every placeholder with verified or
user-confirmed content; never leave a placeholder in a candidate.

```yaml
---
title: "<summary>"
repo_search_index: "<repo-search-index>"
created_at: "<YYYY-MM-DD>"
updated_at: "<YYYY-MM-DD>"
status: "pending"
---
```

The first line after the closing `---` is the document H1 and must be exactly
`# <title>` where `<title>` is the same string as the frontmatter `title`
field. The validator rejects H1/title mismatch.

```markdown
# <title>

## 1. TARGET DIRECTIVES
...
## 2. VARIABLE DEFINITION MATRIX
...
## 3. CHRONOLOGICAL WORKFLOW
...
## 4. TOOL STRATEGY & FALLBACKS
...
## 5. SYSTEMATIC VERIFICATION CHECKLIST
...
## 6. RIGID OUTPUT SCHEMA
...
```

Author each section with these minimum contents:

- **TARGET DIRECTIVES:** one objective, included ownership, and explicit
  exclusions.
- **VARIABLE DEFINITION MATRIX:** every required path, value, source fragment,
  dependency, strict type, and required/optional state.
- **CHRONOLOGICAL WORKFLOW:** independently testable ingest, process, and
  synthesis steps, each as `- [ ] <step>`. Every material requirement names its source, actor or trigger, expected result, must-not constraint, failure or
  boundary case, and proof. Every unit names its responsibility (the executor
  role that carries it out, typically AIDX), its dependencies, its mapped
  requirement, and its completion condition. The responsibility field is
  per-step and replaces the older per-step "owner" wording — establish the
  singular owner (the human decision-maker) exactly once in TARGET DIRECTIVES
  under an Agent Role / Human Owner / Authority & Escalation block.
- **TOOL STRATEGY & FALLBACKS:** the owned primary method, exact input
  boundary, empty or failed-result condition, and concrete fallback.
- **SYSTEMATIC VERIFICATION CHECKLIST:** objective, variable, workflow,
  exclusion, and failure-state checks. Missing, null, ambiguous, unsafe, or
  unverifiable required input is a stop.
- **RIGID OUTPUT SCHEMA:** exact final labels, order, delimiters, required
  values, and omission rules.

The workflow checklist is mandatory: AIDP writes every executable step as
`- [ ]`. AIDX owns the later transition to `- [x]` for completed work or
`- [-]` with a factual reason for an intentionally skipped step.

Keep facts, decisions, assumptions, and unknowns visibly separate throughout
the skeleton. A complete plan is not a list of plausible tasks: it is the
resolved evidence, decisions, ownership, dependency order, acceptance proof,
fallbacks, and final output contract needed by AIDX.

## 5. Ordered Execution Chain

```text
request -> evidence retrieval -> clarification -> plan materialization
        -> validation -> `/aidx` handoff
```

### Hardening rules

Use the retained planning controls: map every target to one owner;
preserve dependency order; distinguish facts from assumptions; separate
reusable patterns from project-specific examples; and make proof observable.
If a target changes a skill package, the plan must name `/skill-manager` before
that change and require its validation and review evidence.

For a material directional choice, keep the decision-quality pass with the
plan's Design record or Architect contribution rather than creating another
workflow. A baseline-first read must establish the current owner, contract,
source of truth, consumers, preserved behavior, and proof before alternatives
are decomposed. If the plan adds a branch, record the retirement trigger or
falsifier and the evidence that would return the work to baseline.

Do not copy old scripts, utilities, session state, or implementation-specific
domain content into the plan. Reject placeholders, duplicate sections,
contradictory instructions, guessed commands, and exact interactive control
tokens as plan content. An existing same-slug plan is updated in place only
after the complete replacement validates; a failed candidate leaves it
unchanged.

Requirements must use observable behavior: actor or trigger, expected result,
preserved or excluded behavior, boundary or failure case, and proof. Record
security, performance, reliability, accessibility, privacy, compatibility, and
operational constraints when material. Prefer existing extension points over a
new abstraction; record a material decision, rejected alternatives,
reversibility, and migration or rollback impact. For UI work, include loading,
empty, error, recovery, keyboard, responsive, and accessibility states only
when the request is user-facing. For a refactor, require a baseline,
preservation invariant, coverage gap, explicit exclusion, and smallest safe
increment.

### Ordered clarification loop

AIDP follows this order for every request: intake the incomplete request;
retrieve repository evidence through `/repo-search` and business context
through `/knowledge-base`; build and compare the evidence set; separate facts,
evidence limits, decisions, and unknowns; ask clarification questions; repeat
retrieval and questioning as needed; then write the complete plan only after
the material questions are resolved. The retrieval step is mandatory even
when the request appears familiar or the caller supplies an index-like value.

The No-Assumption Covenant above governs this loop. Ask one material question
at a time, explain what decision it unlocks, and state the smallest
consequence of each meaningful answer. Never fill an unknown with a plausible
default, convention, inferred preference, silent branch, or `should probably`
— a guess phrased as a tentative sentence is still a guess and is forbidden by
the covenant. If the answer changes targets, ownership, scope, behavior,
safety, architecture, dependencies, or proof, retrieve the affected repository
and private-knowledge context again before asking the next question. Keep
asking focused questions until no material ambiguity remains; if the user has
not resolved one, stop and do not write or hand off a plan. A user preference
is not a requirement until the user decides or evidence establishes it. A
conditional branch is either completed with evidence or skipped with a factual
inapplicability reason; it is never a hidden prerequisite.

## 6. Output & Completion Contract

Materialize only after the ordered clarification loop reaches a resolved state:
the request, repository evidence, business context, target ownership, scope,
dependencies, acceptance behavior, exclusions, and proof strategy are clear.
An empty or unavailable repository/knowledge result remains an explicit
unknown and is a clarification stop when it could affect the plan.
Validate the complete candidate before writing: six sections in order, typed
inputs, complete targets, ordered proofs, concrete fallback, explicit stops,
and an unambiguous output schema. When the conditional decision-quality pass is
triggered, include its invariant, smallest sufficient path, owner decision,
and falsifier in the plan records. Write atomically at the canonical path.
After writing, run the standalone validator against that exact absolute path.
Only after a zero exit status may AIDP hand off the result in this exact shape:

```text
Plan: [<absolute-plan-path>](<absolute-plan-path>)
```

```text
/aidx <relative-or-absolute-plan-path>
```

The link must open the materialized plan, and the fenced block must contain
only the `/aidx` command. The command path may be relative or absolute because
AIDX canonicalizes either form. The absolute form `/aidx <absolute-plan-path>`
is therefore valid, but the handoff must use the relative-or-absolute form
shown above so the contract does not imply that absolute paths are required.
Then stop.
If validation fails, report every finding and preserve the prior plan when one
exists; do not hand off an invalid candidate.

### Standalone plan validation

Before handoff, validate an existing materialized plan with the lightweight
AIDP-only validator:

```text
bun <agents-root>/scripts/aidp-plan-validator.ts <absolute-plan-path>
```

The validator is deliberately independent of execution. It checks the exact
five-field frontmatter, canonical plan path and index match, real dates,
allowed status, the document H1 exactly equals the frontmatter `title`,
the six H2 headings in order (numbered, `## N. <TITLE>`), non-empty
sections, unresolved placeholders, typed variable declarations, numbered
workflow steps, required workflow proof fields, a decision or clarified
marker on every step that asserts a user decision, a no-assumption smell-phrase
scan rejecting unflagged assumptions, primary method ownership, concrete
fallback, mapped verification coverage, and an explicit output schema. It
returns one JSON receipt on success and every actionable finding on failure.
It validates AIDP plans only; it does not parse, complete, import, delete, or
execute plans.

On failure, report the exact missing evidence or validation finding and whether
the prior plan was preserved. Never claim a plan was written when it was not.

## 7. Evaluation Anchors

The skill is strong when it produces a complete six-section plan without
implementation leakage, identifies ambiguity instead of inventing answers,
maps targets to owners and proofs, preserves same-slug updates safely, and
hands off one absolute path. It fails when it guesses, writes partial output,
duplicates workflow state, hides exclusions, or leaves AIDX to rediscover
requirements.
