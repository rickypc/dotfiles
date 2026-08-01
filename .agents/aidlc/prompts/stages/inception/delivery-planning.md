---
stage: delivery-planning
number: "2.8"
phase: inception
condition: "always"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 2.8 Delivery Planning

Translate the approved requirements, design, and unit dependency plan into a
controlled Construction sequence. 2.7 establishes dependencies; this stage
chooses a justified order. It does not add a team-formation stage, native
parallel-agent mechanism, extra approval gate, or a second final test command.

## Inputs and checks

Read the central intent's requirements, UI definition if applicable,
application design, units and dependency graph, and material risks. Verify
that every implementation unit traces to a requirement and that dependencies
are acyclic. If a conditional artifact was skipped, record the factual reason
and plan against the available evidence instead of inventing it.

## Sequencing method

For each implementation increment, record:

- included units and requirements;
- prerequisite dependencies and external constraints;
- the sequencing rationale: risk-first, value-first, thin end-to-end slice,
  dependency-first, or a named combination;
- observable completion criteria and expected validation evidence; and
- risks, fallback, or decision points that could trigger re-planning.

Use parallel work only when the actual project and dependency evidence makes
it safe; the universal workflow neither promises nor requires concurrent
assistants. A thin end-to-end slice is a sequencing technique, not a separate
ceremony or approval gate.

## Construction handoff

Record the ordered implementation plan in the intent's **Plan** section,
including design stages expected per unit, code-generation sequence, and the
single final-gate strategy. The plan must tell Code Generation what to build
without letting it reinterpret product scope. Include a traceability table or
equivalent mapping from requirements to units and validation evidence.

Run the intent-evidence sensor and record completion. The 1.7 approval remains
the only approval boundary; continue to the applicable Construction stage.
