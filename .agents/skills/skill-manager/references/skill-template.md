# Reusable Skill Contract Template

Use this contract in every `SKILL.md`. It preserves the useful properties of a
deterministic execution template—explicit scope, inputs, ordering, outputs, and
examples—without imposing a robotic persona or an exact-output format on skills
whose work requires research, judgment, interaction, or delegated ownership.

Keep these six headings in this order. They are the document architecture, not
a preamble to paste above an existing skill. For an existing `SKILL.md`, map
the old content to an owning heading or nested subsection, rewrite the entire
source in place, and remove superseded blocks. Put command catalogs, routers,
and branch rules under the section that owns them. Do not append the old body
after section 6, duplicate a command table, or add filler to satisfy the
heading count; sections may have different lengths. Replace the placeholder
guidance with the selected skill's verified contract; do not copy
domain-specific examples, external branding, or project-specific paths into
reusable skill prose.

## 1. Role & Scope

- **Role:** State the single job and the owner of the normal path.
- **Objective:** State the user-visible outcome.
- **Trigger:** State the observable requests or conditions that select the skill.
- **Boundary:** State what is out of scope and which neighboring owner handles it.

## 2. Immutable Operational Rules

- State the non-negotiable safety, ownership, ordering, and evidence rules.
- Pair each bright-line rule with its positive target and stop condition.
- Preserve existing contracts and user-owned boundaries unless the request
  explicitly changes them.
- Do not require literal or zero-variance output unless the skill's actual
  interface requires that exact shape.

## 3. Input & Context Schema

- **Required:** List every required input, its type or path form, and its source.
- **Optional:** List optional inputs and the observable condition that selects them.
- **Context:** State which local instructions, evidence, or delegated receipts
  must be loaded before action.
- **Unknowns:** State what is missing, how it is detected, and where the skill
  stops instead of guessing.

## 4. Ordered Execution Chain

1. **Intake:** Parse and validate the required inputs and boundaries.
2. **Normal path:** Perform the skill-owned steps in their actual dependency order.
3. **Branching:** Name observable predicates for alternatives and recovery paths.
4. **Verification:** Check the expected result and retain the independent proof.
5. **Stop or hand off:** Name the failure, approval, or delegated-owner boundary.

Each step must name its action, owner, dependency, and focused proof. A command
catalog belongs to the skill or script that owns its grammar; this section only
routes to that owner.

## 5. Output & Completion Contract

- State the artifacts, receipts, or user-facing result produced by success.
- State the completion proof and the final gate that decides pass or failure.
- State the failure shape, recovery action, and handoff information.
- Do not claim completion from a score, intention, or partial check alone.

## 6. Evaluation Anchors

- Include one canonical invocation or input/output example when it clarifies
  the contract; keep it representative rather than domain-specific filler.
- Cover the normal path, at least one boundary or failure path, and one
  challenge that catches a likely shortcut or rationalization.
- Keep matrix assertions typed, independently verifiable, and tied to the
  skill's actual ownership and completion proof.
- Preserve uncertainty and competing hypotheses when the work is exploratory;
  do not turn an example into an unsupported fact.
