---
stage: code-generation
number: "3.5"
phase: construction
condition: "only after approved plan"
route_authority: "utils/aidlc/stages.ts"
---

# 3.5 Code Generation

Implement the approved acceptance contract using the smallest compatible change.

1. Re-read the current requirements, preservation constraints, design decisions,
   units, acceptance-to-proof mapping, and the central intent's **Construction
   plan**. Select the next `pending` row only when its dependencies are complete;
   mark it `in_progress` before work and `complete` only with actual evidence.
   Use `codebase-memory` for affected code facts and reuse verified project
   extension points.
   Keep the behavior local to the owning interface. Do not extract a pure
   helper only to make a test convenient when the real risk is in the caller,
   and do not add an adapter unless the plan identifies a real seam and its
   consumer-facing proof.
2. Change only the selected row's project assets. Follow the universal Code changes policy:
   minimum scope, reuse first, remove only artifacts made dead by this change,
   and ask before cleaning unrelated pre-existing dead code.
3. Add focused tests and smoke checks for each changed behavior. A green final
   gate cannot prove an acceptance item that has no mapped evidence.
   For each applicable accepted UI/web criterion, invoke
   `playwright-test-generator` before authoring a project-local Playwright test.
   It retains generated browser coverage, uses semantic locators and project
   conventions, and does not install dependencies or create a second gate.
4. Update the selected construction-plan row with changed files/boundaries,
   focused proof, review result, actual evidence, and any deviation. A deviation
   that changes requirement, owner, dependency, risk, or proof must use the
   AIDLC re-plan path before further construction. Then use the action from
   `utils/aidlc/command-contract.ts` to record this stage, or batch it with the
   final gate when it is the last established pre-gate outcome.
5. Before handoff, use the **Review record** and **Validation record** in
   `aidlc/knowledge/shared/software-engineering-work-packets.md`. Select only
   observed language/web guidance; record `No findings` with reviewed scope
   when no evidence-backed issue exists.

Do not modify global runtime assets, hand-edit lifecycle frontmatter, add a
second approval gate, or use implementation to settle an unresolved product
decision. Re-plan with evidence when the approved design is insufficient.
