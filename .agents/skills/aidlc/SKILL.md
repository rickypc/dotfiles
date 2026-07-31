---
name: aidlc
description: Run a selected, upstream-aligned AI-DLC stage route from evidence through validated closure.
---

# AIDLC

Use this skill for a requested change that needs research, a plan, explicit
approval, implementation, validation, and durable knowledge capture.

The single temporary record is:

```text
~/.agents/aidlc/<cbm-index>/intents/<intent-id>.md
```

Do not create separate research, approval, run, validation, or log folders.
Put research, questions and answers, decisions, plan, stage evidence,
validation evidence, and outcome in this one intent. Persistent knowledge is
captured only through `knowledge-base`, outside `~/.agents`.

## Stage route

Use the stage route created by the AIDLC script. Selected stages retain the
upstream AI-DLC v2 number, phase, slug, order, and name. Their conditions are
the deterministic single-intent adaptations of the upstream contracts. Do not
rename, merge, reorder, or silently omit them. `knowledge-distillation` is the
one local closure extension because persistent private KB capture is outside
the upstream workflow.

| Phase | Selected stages |
| --- | --- |
| Initialization | `workspace-scaffold`, `workspace-detection`, `state-init` |
| Ideation | `intent-capture`, `market-research`, `feasibility`, `scope-definition`, `rough-mockups`, `approval-handoff` |
| Inception | `reverse-engineering`, `practices-discovery`, `requirements-analysis`, `user-stories`, `refined-mockups`, `application-design`, `units-generation`, `delivery-planning` |
| Construction | `functional-design`, `nfr-requirements`, `nfr-design`, `infrastructure-design`, `code-generation`, `build-and-test`, `ci-pipeline` |
| Closure | `knowledge-distillation` |

Operation stages are not in the normal code-change route. Add them only when
the user explicitly requests deployment, environment provisioning,
observability, incident response, performance validation, or feedback
optimization; then use their unchanged upstream names and ordering.

## Deterministic execution loop

1. Create or resume the intent. Run the stage packet command; it is the only
   authority for the active stage, role cards, stage contract, and sensors:

```bash
bun ~/.agents/scripts/aidlc/stage.ts next ~/.agents "<intent-path>"
```

Before creating or resuming work, inspect the metadata queue so unfinished,
awaiting-approval, interrupted, superseded, or undistilled intents are visible:

```bash
bun ~/.agents/scripts/aidlc.ts queue ~/.agents "<cbm-index>"
```

The queue report is read-only. Present its bounded metadata summary and let the
user choose queue-first, current-first, or the deterministic recommendation;
never silently discard a leftover intent. A terminal intent completion must
also report the remaining queue.

2. Read every path in the returned packet before working. Read the stage's
   fixed condition. If it applies, perform the stated work. If it does not
   apply, record a specific evidence-based reason; do not fabricate an artifact
   merely to mark a stage complete. A skipped stage is never a stopping point:
   record the skip, run its sensors, immediately request the next stage packet,
   and continue. Stop only for an approval gate, a material unresolved question,
   missing authority, or an unrecoverable deterministic gate.
3. At `practices-discovery`, resolve context before reading its packet. Ask for
   missing organization, team, and project KB concept paths together, use `-`
   only when no record exists, then run:

```bash
bun ~/.agents/scripts/aidlc/context.ts resolve "<intent-path>" "<private-kb-root>" "<organization-concept-or->" "<team-concept-or->" "<project-concept-or->"
```

The resolver reads independent configured KB records together, then applies
organization, team, and project rules in that exact precedence order.

4. Add concise factual evidence to the relevant intent section. Evidence names
   the inspected paths, commands, outputs, decisions, or user answer. Never
   record an inferred command result as evidence.
5. Use one of these outcome commands; quote arguments
   exactly and replace every pattern:

```bash
bun ~/.agents/scripts/aidlc.ts complete "<intent-path>" "<factual stage evidence>"
```

```bash
bun ~/.agents/scripts/aidlc.ts skip "<intent-path>" "<specific condition and evidence-based reason>"
```

   The command updates the intent route and appends an audit entry.

6. Run the packet's sensors against the completed or skipped stage before
   making a completion or approval claim:

```bash
bun ~/.agents/scripts/aidlc/sensors.ts check "<intent-path>" "<completed-stage>"
```

   Repair failed sensors before advancing. The approval sensor runs after the
   approval command because it verifies the recorded user decision.

Use explicit lifecycle commands when a record is re-planned or superseded:

```bash
bun ~/.agents/scripts/aidlc.ts replan "<intent-path>" "<evidence>"
bun ~/.agents/scripts/aidlc.ts supersede "<intent-path>" "<replacement-intent-id>"
```

These preserve the original identity and audit trail; they do not delete or
silently overwrite the record.

7. At `approval-handoff`, complete the plan and stop. Present an explicit
   Approve / Re-plan / Decline choice. Do not build, test, or advance until the
   user approves. On approval, run:

```bash
bun ~/.agents/scripts/aidlc.ts approve "<intent-path>"
```

8. After approval, continue through every remaining stage. Stop only for a
   material unresolved question, missing authority, failed deterministic gate
   that cannot be repaired safely, or a required user action. Never stop at a
   component milestone, after a skipped stage, or while an approved intent has an
   active stage. Do not send a final response or yield control until a true
   terminal condition is reached.

`advance` is intentionally unavailable: it cannot bypass a stage without
evidence or a skip reason.

## Stage contracts

- `workspace-detection`: classify the workspace, stack, package root, tests,
  and browser/runtime boundaries. Use `codebase-memory` only after the CBM
  index readiness check.
- `intent-capture`, `market-research`, and `feasibility`: collect only relevant
  facts. Ask all material unanswered questions together; add answers to the
  intent before planning.
- `scope-definition`, `rough-mockups`, and `refined-mockups`: state in-scope
  work, exclusions, acceptance criteria, risks, commands, exact validation,
  and any required UI or interaction evidence before the gate.
- `reverse-engineering` and `practices-discovery`: inspect existing code and
  project conventions. Use `knowledge-base` when durable project, team, or
  organization knowledge is available; do not invent either.
- `requirements-analysis` through `infrastructure-design`: make only the
  applicable design decisions. A conditional skip must state why existing
  evidence makes it unnecessary.
- `code-generation`: make only approved changes. Generate Bun tests directly
  for new tests. Convert an existing selected Jest test only when it exists;
  do not preserve a Jest test by default.
- `build-and-test`: run behavior, coverage, lint, and type gates. When the
  selected package exposes it, `bun run test` is the non-negotiable default
  aggregate gate: run it and record its exit-zero receipt before Stage 3.6 can
  complete. A different gate requires an explicit project-specific exception
  recorded in the intent before validation. Use
  `bun-test-generator` for selected JavaScript/TypeScript SUT tests and
  `biome-tsc-checker` for every changed selected JS/TS path. For a TypeScript
  declaration-order packet, treat its static facts as baseline evidence, make
  only the permitted whole-declaration reorder as the candidate, rerun the
  checker, and record the candidate result before closure.
- `ci-pipeline`: execute only for CI changes or a demonstrated missing check.
- `knowledge-distillation`: ask `knowledge-base` to capture approved durable
  lessons, then validate and distill. Do not retain transient intent noise.
  After the KB concept and its indexes are verified and this terminal stage is
  completed, retire the one temporary intent with its private KB root and each
  captured concept path; never retire an active or undistilled record:

```bash
bun ~/.agents/scripts/aidlc.ts retire "<intent-path>" "<private-kb-root>" "<concept-path>" ["<concept-path>"...]
```

If no durable knowledge exists, skip `knowledge-distillation` with its factual
reason, then retire the completed intent without KB arguments.

## Browser verification without a callable browser

When a local browser check is required but this session cannot control a
browser, do not claim the check passed. Give the user the exact generated file
URL and the expected visible result using the standard user-action protocol:

```text
file:///<absolute-path-to-page>.html
```

The user action must say what to open, what interaction to perform, the exact
expected result, and the reply that resumes the workflow. Record the user's
reply as browser-validation evidence in the intent.
