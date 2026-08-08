---
name: aidp
description: "Interactively create or update a six-section YAML-frontmatter implementation plan under <project>/.agents/plans/<cbm-index>/ when requirements must be clarified and persisted before execution."
---

# AIDP — Plan Authoring

AIDP is the planning lane. It establishes the project, reads local guidance,
retrieves approved CBM and private-KB context, gathers only materially missing
answers, materializes the physical `template.md`, and writes exactly one plan
file. It never edits source code or executes an execution step.

Use [plan-authoring-contract.md](references/plan-authoring-contract.md) for
role selection, fact/decision separation, and the comprehensive execution-step
contract.

## Trigger and contract

Use `/aidp` when the user wants a feature or fix turned into a detailed plan,
or wants an existing plan revised from new feedback. Do not use it to implement
the plan; hand the resulting relative path to `/aidx`.

The plan frontmatter is YAML and contains exactly `title`, `cbm_index`,
`created_at`, `updated_at`, and `status`. The body contains these six headings
in this order: `ROLE`, `OBJECTIVE`, `CORE DIRECTIVES`, `EXECUTION STEPS`,
`CONSTRAINTS`, and `INPUTS TO PROCESS`. Every execution step names the action,
target, relevant boundary, and focused proof; a vague summary is unresolved.

## Normal path

1. Establish the project from the invocation context or an explicit project
   path, then derive its CBM index from the normalized project path using the
   pattern `<project-root>/<project-name>` to `<project-root>-<project-name>`.
2. Read project guidance and retrieve CBM/KB context through their owning
   wrappers before asking plan questions. Temporary request transport, if a
   wrapper requires it, is internal and never becomes a project root, index, or
   persisted state path.
3. Ask for the plan's requirements, role, objective, and six sections. Do not
   ask the user to approve the derived summary or CBM index. Generate a concise
   summary and slug from the request and project context; ask only when a
   collision or ambiguity changes plan identity. Ask one dependent question at a time;
   ask independent questions together only when their answers cannot change
   one another. Explain why a missing answer matters. An empty answer, `TBD`,
   or ambiguous scope is a clarification stop: do not guess.
4. Run the owning materializer:

   ```text
   bun <agents-root>/scripts/aidp.ts [--project <project-root>] [plan-request]
   ```

   It reads `<agents-root>/skills/aidp/template.md`, validates the complete
   input, and writes only within the project's `.agents/plans/` tree.
5. If `.agents/plans/<cbm-index>/<slugified-summary>.md` exists, load its
   frontmatter and body, present its current values, apply explicit feedback,
   preserve `created_at`, update `updated_at`, and overwrite that same path.
   Otherwise create the new slugified path.
6. Print the exact source-relative path, derived CBM index, and summary slug.
   The user-facing handoff must then contain a Markdown link whose label is the
   generated plan filename and whose target is its generated absolute path,
   followed by a fenced `plaintext` block containing exactly
   `/aidx <relative-plan-path>`. Report whether it was created or updated, then
   stop without executing code.

## Ownership and safety

| Operation | Owner | Boundary |
| --- | --- | --- |
| Project discovery, local guidance, CBM/KB context, and metadata derivation | AIDP conversation and `scripts/aidp.ts` | Context is complete before plan handoff; no temp path affects routing. |
| Requirement questions and ambiguity decisions | AIDP conversation | No missing fact is inferred. |
| Template rendering, YAML parsing, slugification, and path checks | `scripts/aidp.ts` and `utils/aidp.ts` | Only `.agents/plans/<cbm-index>/`; no source edits. |
| Plan execution | `/aidx` | AIDP does not call or emulate it. |

Never accept an absolute plan path, path traversal, a second plan file for an
existing slug, or an unfinished template placeholder. Do not change
`.agents/package.json`, `biome.jsonc`, `bunfig.toml`, `tsconfig.json`, or any
project source while planning.

## Completion proof

Close only when the materializer has parsed the YAML frontmatter, validated all
six sections and granular execution steps, written the file, and printed its
exact project-relative path. If any requirement remains ambiguous, leave the
plan unwritten and ask the next focused clarification question.
