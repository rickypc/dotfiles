---
name: biome-tsc-checker
description: Run Biome and strict TypeScript checks for explicitly selected JavaScript or TypeScript paths.
---

# Biome TypeScript Checker

Use for selected JavaScript or TypeScript files. Resolve each file to its nearest
`package.json`. Run the shared Biome configuration at `~/.agents/biome.jsonc`.
For a selected TypeScript file (`.ts`, `.tsx`, `.mts`, or `.cts`), use the
compiler installed in `~/.agents` with `--noEmit`. For a selected JavaScript
file (`.js`, `.jsx`, `.mjs`, or `.cjs`), run Biome only and report TypeScript
as `not-applicable`. Do not require, suggest, or perform JavaScript-to-
TypeScript conversion as part of static checking.

For every selected JavaScript or TypeScript path, inspect only direct program
children with Tree-sitter's concrete syntax tree. The analyzer selects the TSX
grammar for `.jsx` and `.tsx`; the TypeScript grammar safely covers the other
supported JavaScript and TypeScript extensions. It recognizes imports,
interfaces, type aliases, function declarations, and exactly one-name `const`
assignments whose initializer is a function or arrow function.

Interfaces and type aliases form one contiguous alphabetical block immediately
after imports. Runtime declarations are ordered dependency-first and then
alphabetically among independent declarations. Imports, every unrecognized or
side-effecting top-level statement, duplicate provider, shadowed sortable name,
syntax error, and dependency cycle are barriers: do not cross or repair them.
When ordering is noncanonical, the checker emits an evidence-gated action
packet. Apply only its whole-declaration reorder, rerun the checker as the
candidate evidence, and never edit a declaration body, signature, comments,
imports, exports, or target configuration to satisfy this check. Comment
regions are not a rule or source of ordering metadata.

## Declaration-order protocol

Use this protocol exactly in a new session. Without `--apply`, the script is an
inspection and evidence command: it never edits a source file. It writes one JSON object with
`checks`; each check has `path`, `status`, `detail`, and `actionPacket`. Treat
the JSON fields as the only authority for declaration ordering.

1. Run the inspection command for every selected JavaScript or TypeScript path.
2. For `status: "passed"`, make no declaration-order edit to that path.
3. For `status: "failed"`, require a non-null `actionPacket`. Read every
   `requiredActionGroups` entry. Edit only its `allowedPaths`; move whole
   declarations into the `title` order; obey every `forbiddenActions` entry.
   Do not change declaration bodies, signatures, comments, imports, exports,
   names, or unrelated source. Do not introduce section-marker comments.
4. Rerun the same command after the one candidate edit batch. A path passes
   only when its returned `status` is `"passed"` and `actionPacket` is `null`.
5. For `status: "blocked"`, make no ordering edit. The `detail` states the
   duplicate name, shadowing, or dependency cycle that prevents a safe order.
   Report that exact blocker and ask for direction; never guess an order.
6. If `status: "failed"` has a null `actionPacket`, stop and report a checker
   defect. Do not invent a reorder.

For the global `<agents-root>` package, `bun run test:lint` runs Biome and
declaration-order inspection for every TypeScript source independently. It
always reports every gate result, then fails when any fails. A noncanonical or
blocked TypeScript file fails that gate. Its healthy output is one checked-file
summary per inspection; failures retain only actionable paths and
declaration-order action packets. Selected JavaScript paths remain covered by
the checker command above.

The AIDLC baseline records the inspection JSON. The candidate rerun is the
candidate receipt; a final unchanged rerun is the challenge receipt. Record
each actual output in the active intent before claiming the stage passed.

Do not change a target project's configuration, manifest, or dependencies. If a
project-specific setting is required, return the standard user-action protocol.
Report each selected path and gate separately. A project may opt into JavaScript
type checking through its own configuration, but this reusable checker does not
infer or modify that configuration.

```bash
bun <agents-root>/scripts/biome-tsc-checker.ts <path> [<path>...]
```

To inspect the packet without running lint or type checking:

```bash
bun ~/.agents/scripts/declaration-order.ts <path> [<path>...]
```

Use the safe deterministic fixer only after reviewing a failed packet. It
applies only CST-proven whole-declaration moves and returns the fresh receipt:

```bash
bun ~/.agents/scripts/declaration-order.ts --apply <path> [<path>...]
```

For a concise multi-file gate receipt, use summary mode. It omits passing file
records and includes only actionable errors:

```bash
bun ~/.agents/scripts/declaration-order.ts --summary <path> [<path>...]
```
