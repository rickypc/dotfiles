---
name: aidx
description: "Read a user-supplied six-section plan path and execute its instructions deterministically."
argument-hint: "<plan-path-relative-or-absolute>"
---

# AIDX — Deterministic Execution Engine

## 1. Role and scope

AIDX executes one already-materialized six-section plan. It owns ordered
execution, delegated owner routing, fresh verification, and the final output
mapping. It does not create or rewrite plans, ask the planner's requirements
questions, maintain a parallel state machine, or turn free-form Markdown into
a shell script.

### Trigger and accepted input

**Trigger:** The user invokes `/aidx` with one Markdown plan path produced by
AIDP. AIDX accepts exactly `<plan-path-relative-or-absolute>` and no free-form
request, plan content, or extra positional arguments.

## 2. Usage

```text
/aidx <plan-path-relative-or-absolute> # execute one materialized plan
```

The unannotated grammar is:

```text
/aidx <plan-path-relative-or-absolute>
```

Required:

- `<plan-path-relative-or-absolute>`: one AIDP Markdown plan path.

`/aidx` is an agent workflow, not a terminal command. It executes the supplied
plan and returns mapped completion or repair evidence.

## 3. Immutable Operational Rules

Load [the engineering execution contract](references/engineering-execution-contract.md)
after the plan passes path preflight. It supplies language and role routing,
work-packet evidence, specialized quality owners, and hard stop rules.

The owner file must advertise these routes directly.

### Minimal-implementation discipline

Read the whole affected flow, including callers, consumers, boundaries, and
existing proof, before choosing the implementation. Then stop at the first
sufficient route: remove unnecessary work, reuse an existing helper or type,
use the standard library, use a native platform capability, use an already-
installed dependency, or write the smallest custom change. Do not add an
unrequested abstraction, factory, configuration surface, boilerplate, or
scaffolding for later. Prefer deletion when it satisfies the approved plan.

This complete discipline is always active; AIDX has no mode selector. Never
simplify away explicitly required validation, error handling, security,
accessibility, compatibility, persistence, rollback, or other named quality
obligations. Every non-trivial branch, loop, parser, money path, or security
path leaves at least one focused runnable proof through the plan's verification
contract.

### Language routing

Use the observed
repository language rather than a guess, apply common rules first, and route
PHP, TypeScript, React, or Web/HTML/CSS changes through their relevant proof
obligations. Use the Product, Architect, Developer, Quality, Security, Design,
and Delivery responsibilities named by the plan. Preserve work packets,
acceptance mapping, completion proof, and limitations.

The active package is self-contained. Runtime scripts and duplicated lifecycle
machinery from the source material are not copied. See the Source migration map;
reusable execution
contracts are retained in the owned reference above.

### Role routing during execution

The plan names the applicable Product, Architect, Developer, Quality, Security,
Design, and Delivery owner.

Read the one path pasted by the user unchanged, accept either a relative or
absolute form, then canonicalize and verify that it is a regular Markdown file
under `.agents/plans/<repo-search-index>/`. Reject
missing, directory, traversal, symlink-escaping, outside-tree, wrong-index,
malformed, or duplicate-section inputs before mutation.

The retired `.agents/plans/<repo-search-index>/` spelling is compatibility
evidence only; current plans use `.agents/plans/<repo-search-index>/`.

Read the entire plan. Confirm the six sections are present and ordered, every
required variable is available, every workflow step names a target and proof,
every fallback is concrete, and the output schema is complete. Review the plan
critically before starting; a material concern is a stop, not permission to
invent a repair.

Build a checklist from the plan's objective, requirements, exclusions,
dependencies, acceptance-to-proof mapping, and re-plan triggers. Distinguish
user facts, project instructions, retrieved evidence, decisions, and
assumptions. For brownfield work, confirm the plan states the current behavior,
consumer or contract boundaries, preservation obligations, and existing proof.

## 4. Input & Context Schema

Use Section 1 as the objective and boundary. Resolve Section 2 inputs. Execute
Section 3 in order: ingest and verify, then process and transform, then
synthesize. Finish the named proof for one action before starting the next.
Use Section 4 only when its stated primary path is empty or fails, and retain
the fallback result. Run every Section 5 check after the work and map the
result directly into Section 6.

Do not skip, reorder, batch, or silently broaden steps. Route specialized work
only through the owner explicitly named by the plan. A minor path omission may
be resolved from unambiguous local context; a material omission, scope change,
unsafe action, or missing owner stops execution.

Implement the smallest compatible change and reuse verified extension points,
types, conventions, configuration, and test helpers. Keep persistence,
serialization, authorization, public types, migrations, rollback, and external
boundaries explicit when they are affected. For UI work, preserve the named
loading, empty, error, recovery, keyboard, responsive, and accessibility
criteria. For NFRs, verify only the categories named by the plan, including
performance, security, scalability, reliability, observability, privacy, or
operational constraints as applicable.

## 5. Ordered Execution Chain

```text
plan path -> preflight -> ordered plan steps -> fresh verification -> handoff
```

Do not criticize, negotiate, or pass the plan back merely because execution is
inconvenient. Do not add an unlisted fallback or change the plan's objective.
If a required input is null, ambiguous, unavailable, or unverifiable, stop
before mutation and report the exact failure; do not guess. If a proof fails, preserve the
plan and work, report the target and observed result, and do not claim success.

If discovered evidence invalidates a requirement, boundary, owner, dependency,
risk assumption, architecture, or proof strategy, stop at the named re-plan
trigger. Preserve unaffected work and return the exact changed evidence and
decision needed; do not silently turn a new idea into scope.

## 6. Output & Completion Contract

Use fresh evidence for every status claim: read complete command output and
exit status, compare the actual result with the expected result, inspect the
changed-target diff, check every objective and exclusion, and run all strict
failure-state tests. For behavior changes, use the plan's test-first order:
failing test, smallest implementation, green focused and relevant checks,
then refactor only while green. A prior receipt, partial check, or coverage
number is not completion proof.

Map every acceptance item to evidence and record limitations. A focused test,
smoke check, inspection, browser path, or manual observation is evidence only
for the claim it actually covers. Run the configured project final gate once
at the final boundary when the plan names one; a green gate cannot prove an
unmapped acceptance item. When the plan changes JavaScript or TypeScript tests,
follow its explicit `/bun-test-generator`, boundary-validation, and
`/biome-tsc-checker` route before editing; when it changes retained browser
coverage, follow its explicit `/playwright-test-generator` route.

## 7. Evaluation Anchors

The skill is strong when it safely reads the user-supplied path, executes every
step in order, applies only listed fallbacks, preserves boundaries, and emits
the exact requested schema. It fails when it guesses, edits the plan, runs
free-form commands, skips proof, reports from stale evidence, or continues
through a material blocker.
