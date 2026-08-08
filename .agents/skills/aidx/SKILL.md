---
name: aidx
description: "Execute a previously materialized six-section plan from a relative .agents/plans path, parsing its YAML frontmatter with gray-matter and applying the execution steps sequentially when the user explicitly requests implementation."
---

# AIDX — Strict Plan Executor

AIDX is the execution lane. It consumes one complete plan produced by `/aidp`;
it does not establish a project, inspect local guidance, run CBM or KB
retrieval. It does not create plans, ask the planner's requirements questions,
maintain a second state machine, or write planner records. It also does not
slice plan content or construct OKF concept bodies; the knowledge-base plan
importer owns that work.

Use [execution-contract.md](references/execution-contract.md) for the
implementation, validation, repair, and stop-boundary rules retained from the
legacy executor.

## Trigger and input

Use `/aidx <relative-plan-path>` only when the user explicitly identifies a
plan to execute. The path is relative to the selected project root and must
resolve inside `.agents/plans/<cbm-index>/`. Absolute paths and traversal
outside that directory are rejected.

The executable contract is:

```text
bun <agents-root>/scripts/aidx.ts <relative-plan-path>
```

After all implementation steps and focused proofs pass, AIDX completes the
path-only handoff with:

```text
bun <agents-root>/scripts/aidx.ts complete <relative-plan-path>
```

That completion command passes only the relative plan path to the
knowledge-base `import-plan` command. It reports the importer receipt and
deletes the source plan only after the importer succeeds. It fails without a
success receipt when import or cleanup fails.

The parser in `utils/aidx.ts` uses `gray-matter` to read the specified file,
requires exactly the five frontmatter fields and six ordered sections from the
template, rejects placeholders and non-granular steps, and returns the ordered
execution steps. Parsing is read-only; the `complete` command removes the
source plan only after successful import and receipt validation.

## Sequential execution

1. Invoke the parser and read its complete receipt before editing any file.
2. Treat the plan's supplied context and proofs as authoritative execution
   inputs; do not repeat discovery or context retrieval. Present the six
   sections and ordered steps to the user. If a step,
   constraint, input, or expected proof is ambiguous, stop and return to
   `/aidp`; do not invent a missing requirement.
3. Execute step 1 completely: inspect its named inputs, make only the stated
   code change, and run the focused proof named by that step.
4. Record the observed result, then execute the next step in order. Preserve
   the plan's boundaries and never reorder steps because a later step appears
   easier.
5. If implementation changes scope, ownership, architecture, or acceptance,
   stop immediately and ask `/aidp` to update the same plan slug. Do not edit
   the plan from AIDX or continue against stale instructions.
6. Finish only after every step and its proof succeeds. Report the relative
   plan path, files changed, validation receipts, and the knowledge-base
   importer receipt returned by the completion handoff and the source-plan
   cleanup receipt.

Never interpret the plan as a shell script. Do not execute commands embedded in
free-form plan text without applying the normal project command and safety
checks. AIDX performs the user's code changes sequentially through the LLM
execution lane; the deterministic script only parses and orders the plan.

## Completion proof

Completion requires a successful gray-matter parse, exact section validation,
step-by-step implementation evidence, and proof for every execution step. A
parse failure, ambiguity, failed proof, or scope change is a stop condition,
not a successful execution.
