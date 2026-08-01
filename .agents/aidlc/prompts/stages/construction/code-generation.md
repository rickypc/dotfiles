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
   units, and acceptance-to-proof mapping. Use `codebase-memory` for affected
   code facts and reuse verified project extension points.
2. Change only selected project assets. Follow the universal Code changes policy:
   minimum scope, reuse first, remove only artifacts made dead by this change,
   and ask before cleaning unrelated pre-existing dead code.
3. Add focused tests and smoke checks for each changed behavior. A green final
   gate cannot prove an acceptance item that has no mapped evidence.
   For each applicable accepted UI/web criterion, invoke
   `playwright-test-generator` before authoring a project-local Playwright test.
   It retains generated browser coverage, uses semantic locators and project
   conventions, and does not install dependencies or create a second gate.
4. Record changed files, acceptance mapping, tests/smokes, decisions, and known
   limitations. Then use the action from `utils/aidlc/command-contract.ts` to
   record this stage, or batch it with the final gate when it is the last
   established pre-gate outcome.

Do not modify global runtime assets, hand-edit lifecycle frontmatter, add a
second approval gate, or use implementation to settle an unresolved product
decision. Re-plan with evidence when the approved design is insufficient.
