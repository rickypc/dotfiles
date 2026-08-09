# Reusable Skill Contract Template

Use this contract in every `SKILL.md`. It preserves the useful properties of a
deterministic execution template—explicit scope, inputs, ordering, outputs, and
examples—without imposing a robotic persona or an exact-output format on skills
whose work requires research, judgment, interaction, or delegated ownership.

Keep these seven headings in this order. They are the document architecture, not
a preamble to paste above an existing skill. For an existing `SKILL.md`, map
the old content to an owning heading or nested subsection, rewrite the entire
source in place, and remove superseded blocks. Put invocation catalogs, routers,
and branch rules under the section that owns them. Do not append the old body
after section 7, duplicate an invocation command catalog, or add filler to satisfy the
heading count; sections may have different lengths. Replace the placeholder
guidance with the selected skill's verified contract; do not copy
domain-specific examples, external branding, or project-specific paths into
reusable skill prose.

Prefer a clear command example, table, or text diagram before prose; write only
what the visual cannot show.

## 1. Role & Scope

- **Role:** State the single job and the owner of the normal path.
- **Objective:** State the user-visible outcome.
- **Trigger:** State the observable requests or conditions that select the skill.
- **Boundary:** State what is out of scope and which neighboring owner handles it.

## 2. Usage

```text
/skill-name                                       # smart default or primary action
/skill-name command [path]                        # run one named operation
/skill-name command <required-arg> [optional-arg] # what this command does
```

- Make this aligned block the complete invocation catalog for the skill; do not
  add a separate invocation catalog elsewhere. Align the `#` comments, show
  optional arguments in `[brackets]`, and make each comment state the action or
  result. The first line may be a smart default only when the skill supports
  one.

- Under the catalog, state accepted formats, defaults, workflow versus terminal
  context, and only the argument rules not already obvious from the lines.
- Prefer this catalog for invocation syntax. A domain-owned command or
  information table may appear outside `Usage` when it documents a delegated
  route rather than another invocation grammar. Use exactly four columns:
  `Command or information` | `Arguments` | `When to use` | `Additional information`.
  Put it under the section that owns the route, keep one route per row, and
  preserve owner commands, placeholders, receipts, fallbacks, and restrictions.

## 3. Immutable Operational Rules

- State the non-negotiable safety, ownership, ordering, and evidence rules.
- Pair each bright-line rule with its positive target and stop condition.
- Preserve existing contracts and user-owned boundaries unless the request
  explicitly changes them.
- Do not require literal or zero-variance output unless the skill's actual
  interface requires that exact shape.

## 4. Input & Context Schema

- **Required:** List every required input, its type or path form, and its source.
- **Optional:** List optional inputs and the observable condition that selects them.
- **Context:** State which local instructions, evidence, or delegated receipts
  must be loaded before action.
- **Unknowns:** State what is missing, how it is detected, and where the skill
  stops instead of guessing.

## 5. Ordered Execution Chain

```text
       [*]
        |
        v
+---------------+
|  SKILL_INIT   | --( invocation )--> [   INVOKE_SCRIPT   ]
+---------------+                             |
                                              | / run script-name <required-arg>
                                              |   & import util file
                                              v
                                      [  AWAIT_OUTPUT  ]
                                              |
                                              | / receive JSON: {"key": "value"}
                                              v
                                      +---------------+
                                      | ANALYZE_DATA  |
                                      +---------------+
                                        |           |
               [script-name.key == true]        [script-name.key == false]
                                        |           |
                                        v           v
                                     +------+   +-----------------------+
                                     | EXIT |   |    CALL_SCRIPT_B      |
                                     +------+   +-----------------------+
                                        |                   |
                                        v                   | / run script-name-b
                                       [*]                  |   <required-arg>
                                                            v
                                                           [*]
```

Start this section with a compact plain-text flow diagram showing the normal
route and its major handoffs. Then explain only the decisions, boundaries,
predicates, and proof the diagram cannot express. The diagram is a map, not a
second command router.

1. **Intake:** Parse and validate the required inputs and boundaries.
2. **Normal path:** Perform the skill-owned steps in their actual dependency order.
3. **Branching:** Name observable predicates for alternatives and recovery paths.
4. **Verification:** Check the expected result and retain the independent proof.
5. **Stop or hand off:** Name the failure, approval, or delegated-owner boundary.

Each step must name its action, owner, dependency, and focused proof. An
invocation catalog belongs to the skill or script that owns its grammar; a
domain-specific four-column command or information table belongs to the section
that owns that downstream route. This section only routes to that owner.

## 6. Output & Completion Contract

- State the artifacts, receipts, or user-facing result produced by success.
- State the completion proof and the final gate that decides pass or failure.
- State the failure shape, recovery action, and handoff information.
- Do not claim completion from a score, intention, or partial check alone.

## 7. Evaluation Anchors

- Include one canonical invocation or input/output example when it clarifies
  the contract; keep it representative rather than domain-specific filler.
- Cover the normal path, at least one boundary or failure path, and one
  challenge that catches a likely shortcut or rationalization.
- Keep matrix assertions typed, independently verifiable, and tied to the
  skill's actual ownership and completion proof.
- Preserve uncertainty and competing hypotheses when the work is exploratory;
  do not turn an example into an unsupported fact.
