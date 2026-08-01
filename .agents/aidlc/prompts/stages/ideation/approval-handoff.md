---
stage: approval-handoff
number: "1.7"
phase: ideation
condition: "always; explicit approval"
route_authority: "utils/aidlc/stages.ts"
---

# 1.7 Approval and Handoff

This is the sole human plan-approval gate. Compile existing Ideation evidence;
do not add research, design artifacts, staffing assumptions, or a second scope.

## Required handoff

Record one concise decision package:

- requested outcome and user value;
- in-scope behavior, exclusions, and observable acceptance checklist;
- verified current-state facts, material assumptions, constraints, and risks;
- UI applicability and expected conditional work; and
- the already-resolved single final project gate.

State the intended implementation sequence so Construction does not reinterpret
product scope. This forecast never permits a later stage to be omitted without
factual evidence.

## Decision

Present Approve, Re-plan, or Decline, then end the response. The assistant must
wait for a later user message that explicitly approves this intent; it must not
call `approve` based on task authorization, an earlier approval, or its own
restatement of the plan. Before asking for approval, obtain any validated
context bindings from `knowledge-base`. After explicit approval, use the one
returned action from `utils/aidlc/command-contract.ts`; it atomically
persists the handoff, approval, and any already-validated context or
consecutive evidence. Do not complete this stage separately, repeat approval,
or use standalone context resolution on a normal new route.

Approval applies to this evidence-backed scope. A material later change must be
re-planned against its impact; it does not add routine approval gates.
