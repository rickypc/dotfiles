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

The canonical path is
`.agents/plans/<repo-search-index>/<summary-slug-160-chars>.md`. The slug is stable,
descriptive, and no longer than 160 characters. If a requirement could change
scope, ownership, safety, architecture, or acceptance, stop for a focused
clarification; do not guess and do not write a partial plan.

The retired `<repo-search-index>` spelling and its historical path form
`.agents/plans/<repo-search-index>/<summary-slug-160-chars>.md` are preserved
only as compatibility evidence; new plans use `<repo-search-index>`.

## 4. Input & Context Schema

Write exactly these six numbered level-three sections, in this order. Headings must match the forms below; do not use aliases or add top-level headings:

### 1. TARGET DIRECTIVES

State one objective and explicit scope boundaries, exclusions, and ownership.

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

Materialize the plan with exactly this frontmatter shape before the six
sections. Replace every placeholder with verified or user-confirmed content;
never leave a placeholder in a candidate.

```yaml
---
title: "<summary>"
repo_search_index: "<repo-search-index>"
created_at: "<YYYY-MM-DD>"
updated_at: "<YYYY-MM-DD>"
status: "pending"
---
```

Author each section with these minimum contents:

- **TARGET DIRECTIVES:** one objective, included ownership, and explicit
  exclusions.
- **VARIABLE DEFINITION MATRIX:** every required path, value, source fragment,
  dependency, strict type, and required/optional state.
- **CHRONOLOGICAL WORKFLOW:** independently testable ingest, process, and
  synthesis steps, each as `- [ ] <step>`. Every material requirement names its source, actor or
  trigger, expected result, must-not constraint, failure or boundary case, and
  proof. Every unit names its owner, dependencies, mapped requirement, and
  completion condition.
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

Ask one material question at a time, explain what decision it unlocks, and
state the smallest consequence of each meaningful answer. Never fill an
unknown with a plausible default, convention, inferred preference, or silent
branch. If the answer changes targets, ownership, scope, behavior, safety,
architecture, dependencies, or proof, retrieve the affected repository and
private-knowledge context again before asking the next question. Keep asking
focused questions until no material ambiguity remains; if the user has not
resolved one, stop and do not write or hand off a plan. A user preference is
not a requirement until the user decides or evidence establishes it. A
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
and an unambiguous output schema. Write atomically at the canonical path.
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
allowed status, the six headings in order, non-empty sections, unresolved
placeholders, typed variable declarations, numbered workflow steps, required
workflow proof fields, primary method ownership, concrete fallback, mapped
verification coverage, and an explicit output schema. It returns one JSON
receipt on success and every actionable finding on failure. It validates AIDP
plans only; it does not parse, complete, import, delete, or execute plans.

On failure, report the exact missing evidence or validation finding and whether
the prior plan was preserved. Never claim a plan was written when it was not.

## 7. Evaluation Anchors

The skill is strong when it produces a complete six-section plan without
implementation leakage, identifies ambiguity instead of inventing answers,
maps targets to owners and proofs, preserves same-slug updates safely, and
hands off one absolute path. It fails when it guesses, writes partial output,
duplicates workflow state, hides exclusions, or leaves AIDX to rediscover
requirements.
