# Goal planning guide

Use this reference when a goal needs more structure than a short file list.
It enriches the AIDX plan; it does not add another state, ceremony, or
approval gate.

## Scope and depth

Start with one outcome sentence, then identify the smallest set of acceptance
criteria, affected boundaries, risks, and proof. Calibrate depth to evidence:

| Goal shape | Plan depth | Typical proof |
| --- | --- | --- |
| One isolated behavior or defect | One increment, one owner boundary | Focused unit or integration check |
| Several related files or a small feature | Two to four increments | Focused checks plus the repository gate |
| Cross-boundary, public, security-sensitive, or data-changing work | Explicit requirements, design decisions, dependency order, rollback or compatibility notes | Tests for each boundary plus the repository gate |

Do not create an epic, story hierarchy, or artificial work stream for a single
goal. Split only when an increment has a distinct owner boundary, dependency,
proof, or safe delivery point.

## Plan contents

For each acceptance criterion, record:

- the actor or trigger and observable result;
- the preserved behavior, exclusion, or safety boundary;
- the source fact or user decision that supports it;
- the affected file, symbol, interface, data shape, or narrow discovery
  boundary; and
- the focused proof and final-gate relationship.

For each implementation increment, record what changes, where it changes, why
it is ordered there, what it depends on, how it will be checked, and the fact
that would require a re-plan. A plan that leaves a material ownership,
interface, data, security, accessibility, or validation question for
implementation is not ready for approval.

## Sequencing choices

Choose the smallest rationale that fits the evidence:

1. **Dependency-first** when a prerequisite contract or shared component must
   exist before its consumer.
2. **Risk-first** when an uncertain integration, migration, or compatibility
   boundary could invalidate later work.
3. **Thin-slice-first** when an end-to-end path can prove the architecture or
   user outcome early.
4. **Value-first** when dependencies and risk are low and an independently
   useful outcome can ship sooner.

Do not use topological ordering alone as a delivery rationale. The dependency
graph explains what is possible; the plan should also explain what reduces risk
or proves value first.

## Re-plan triggers

Return to plan generation when evidence changes a requirement, public contract,
data model, ownership boundary, dependency, security or accessibility posture,
rollback expectation, or acceptance proof. Record the fact and supersede the
previous plan version; do not silently reinterpret approval.

## Planning checklist

- [ ] Every acceptance criterion is observable and has proof.
- [ ] Every changed boundary has an owner and evidence.
- [ ] Negative behavior and preserved behavior are explicit.
- [ ] Dependencies, ordering, and rollback or compatibility effects are named
      when material.
- [ ] UI work has intentional states, responsive behavior, and accessibility
      acceptance; use the design and implementation skills for their owned
      details.
- [ ] Test scope distinguishes focused checks from the repository final gate.
- [ ] Unknowns are questions or re-plan triggers, never hidden assumptions.
