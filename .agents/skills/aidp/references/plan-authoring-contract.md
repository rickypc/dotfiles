# AIDP plan authoring contract

Select one role by decision relevance and load only the smallest specialist
guidance that can change the plan. Record facts separately from user decisions
and assumptions. An unresolved material ambiguity is a stop condition, not an
implicit default.

Every execution step must identify:

- `Action` — the concrete operation or decision;
- `Target or Boundary` — the exact file, symbol, artifact, or scope;
- `Change or Decision` — what will be different;
- `Dependency or Ordering` — what must precede or follow it;
- `Reason` — the evidence-backed purpose;
- `Acceptance or Proof` — the focused observable check; and
- `Failure or Stop` — the condition that returns the work to planning.

Every ordered step is a numbered Markdown list item with one checkbox on that
same item: `[ ]` pending, `[~]` in-progress, `[!]` blocked, `[x]` complete, or
`[-]` skipped with a reason. A legend or aggregate status receipt may explain
the vocabulary, but it cannot replace one checkbox per item. Reject the candidate
when any ordered step is missing its own checkbox, has an unsupported status, or
claims completion without the required proof or reason. Rule: every ordered step
must have one checkbox per item; reject the candidate if any item lacks one.

For migrations and transformations, also state `Source -> Target`, the exact
section or symbol, and whether the source is fully or partially ported. For a
goal without a migration source, use the target/boundary form instead.

AIDP must complete the relevant repository, CBM, and KB research before
materialization. An execution step may not delegate “research these files,”
“inspect and decide,” or equivalent discovery to AIDX; the step must record the
resolved finding, source, destination, reason, and proof needed to execute it.

Before writing the ordered list, AIDP must produce an implementation-ready
target map: each create, modify, test, reference, and configuration target has
one responsibility, an exact path, and a verified symbol, section, interface,
or test target when available. Each ordered item is an independently testable
deliverable with one concrete action, a smallest useful boundary, explicit
dependency ordering, and an acceptance proof naming the exact command or
deterministic check plus its expected outcome. Include the selected approach
and rejected alternative when that decision changes the implementation. Do not
materialize placeholders such as `TBD`, `TODO`, “implement later”, “add
validation”, or “write tests for the above”; resolve the detail during AIDP
research or stop for clarification.

Before materialization, AIDP self-reviews the complete plan: map every
objective, acceptance criterion, constraint, and explicit exclusion to an
ordered item and proof; scan for placeholders; verify names, interfaces, and
dependencies are consistent; and preserve unresolved gates as pending or
blocked. The self-review is performed by AIDP and is not delegated to AIDX.

For repository intake, begin README-first. Check the primary files and
high-signal directories that exist, extract a documented command inventory and
entrypoints, classify target responsibilities from explicit evidence, label
inferred findings, and record ambiguity instead of guessing. Preserve the
source path and the distilled finding in the target map or ordered step; do not
hand repository discovery to AIDX.

For language-aware work, identify the observed language/framework from project
evidence, read the shared `common.md` guidance first, then select only the
applicable sections of `profiles.md`. Map each affected target to its relevant
language/framework obligation and the project-owned final gate. Do not copy
unrelated profiles, invent a universal command, or replace stricter project
guidance.

For a refactor request, the plan must establish baseline behavior and
preservation invariants, inspect test coverage and gaps, define scope and
explicit exclusions, record each material rejected alternative, and order the
smallest safe increments. Each increment needs an independent proof and a
stop condition; do not turn refactoring into unrestricted cleanup or change
behavior without an explicit requirement.

For every example or project artifact used during research, separate the
reusable pattern from the example payload. Retain only generalized workflow
controls, ownership rules, validation behavior, status semantics, evidence
requirements, or other facts that apply beyond the source project. Record
`Source -> Target`, `Disposition` (`retain pattern` or `discard detail`), and
the reason for each decision. Discard project-specific domain names, entities,
fields, feature labels, configuration values, mapper details, and business
content from reusable skills, templates, and framework plans. Do not turn an
example into a generic placeholder by renaming its nouns. If the user requests
the source project's implementation, its project plan may contain those details;
otherwise they are research evidence only and must not reach AIDX.

The section heading is exactly `ORDERED EXECUTION STEPS`; do not introduce
aliases or alternate headings. If any
source, target, test, template, reference, or instruction belongs to a skill
package, the plan must include a `/skill-manager` step before any skill change,
name the affected package, and require Skill Manager validation/review proof.
The plan must say that AIDX follows this owner step rather than editing the
skill package directly.

The plan must map every acceptance criterion to proof, preserve explicit
exclusions, and keep reusable links relative or placeholder-based.
