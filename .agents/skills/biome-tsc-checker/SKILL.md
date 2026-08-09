---
name: biome-tsc-checker
description: Run Biome and strict TypeScript checks for explicitly selected JavaScript or TypeScript paths.
---

# Biome TypeScript Checker

## 1. Role & Scope

This skill owns focused static checking for explicitly selected JavaScript and
TypeScript paths. It reports Biome, strict TypeScript, and top-level
declaration-order results without implementing behavior, generating tests, or
broadening the selected paths. A JavaScript path receives Biome and an explicit
TypeScript `not-applicable` result; a TypeScript path receives Biome and
strict `--noEmit` checking.

## 2. Immutable Operational Rules

- Resolve every selected path to its nearest `package.json` and use the shared
  `<agents-root>/biome.jsonc`; do not change target configuration or
  dependencies to obtain a green result.
- Inspect only direct program children with Tree-sitter's concrete syntax tree.
  `.jsx`/`.tsx` use TSX grammar; other supported extensions use TypeScript
  grammar.
- Treat imports, unrecognized or side-effecting top-level statements,
  duplicate providers, shadowed names, syntax errors, and dependency cycles as
  barriers. Do not cross or repair them.
- If declaration order is noncanonical, apply only a returned whole-declaration
  action packet. Never change declaration bodies, signatures, comments,
  imports, exports, names, or configuration.
- A failed or blocked checker is evidence to return to the owning
  implementation/test skill. Never infer green from a partial command or a
  passing unrelated path.

## 3. Input & Context Schema

- **Required:** One or more selected `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`,
  `.tsx`, `.mts`, or `.cts` paths.
- **Optional:** A grouped path list when all paths share the intended check
  boundary and summary mode for a concise multi-file receipt.
- **Context:** Nearest package roots, shared Biome config, compiler installed in
  `<agents-root>`, grammar rules, and the selected path's current source.
- **Unknowns:** Unsupported extensions, missing paths, unresolved package roots,
  syntax errors, barriers, cycles, or a failed action packet are explicit
  stops. Report the exact path and diagnostic.

## 4. Ordered Execution Chain

1. **Intake:** Validate each path and extension, resolve its nearest package,
   and confirm the shared config/compiler boundary.
2. **Static checks:** Run Biome for every selected path. Run strict TypeScript
   with `--noEmit` for `.ts`, `.tsx`, `.mts`, and `.cts`; report TypeScript as
   `not-applicable` for JavaScript.
3. **Declaration order:** Run the CST inspection for every selected path. For
   `passed`, make no order edit. For `failed`, require a non-null action
   packet, read every `requiredActionGroups` entry, and move only whole
   declarations in the packet's `allowedPaths`. For `blocked`, report the
   duplicate, shadowing, or cycle and make no edit.
4. **Candidate verification:** Rerun the same complete command after one
   permitted reorder batch. A path passes only when status is `passed` and
   `actionPacket` is `null`.
5. **Handoff:** Return per-path receipts and any exact diagnostics to the
   owning skill. Do not autofix unrelated files.

### Commands owned by this skill

```bash
bun <agents-root>/scripts/biome-tsc-checker.ts <path>
bun <agents-root>/scripts/declaration-order.ts <path>
bun <agents-root>/scripts/declaration-order.ts --apply <path>
bun <agents-root>/scripts/declaration-order.ts --summary <path>
```

Without `--apply`, declaration-order inspection never edits a source file and
returns one JSON object whose checks contain `path`, `status`, `detail`, and
`actionPacket`. `--apply` is allowed only after reviewing a failed packet and
applies its CST-proven whole-declaration moves. Repeat the complete command
for another selected path; do not invent shorthand arguments or section-marker
comments.

The receipt shape is the authority: `const` declarations are represented in
`checks`; a `status: "passed"` result has no action, a `status: "failed"`
result must include a packet with `title` and `forbiddenActions`, and a
`status: "blocked"` result has no permitted reorder. The rerun must return
`"passed"` before the candidate is accepted.

```bash
bun <agents-root>/scripts/biome-tsc-checker.ts <path>
```

```bash
bun <agents-root>/scripts/declaration-order.ts <path>
```

```bash
bun <agents-root>/scripts/declaration-order.ts --apply <path>
```

```bash
bun <agents-root>/scripts/declaration-order.ts --summary <path>
```

### Declaration-order contract

Interfaces and type aliases form one contiguous alphabetical block immediately
after imports. Runtime declarations are dependency-first and alphabetical
among independent declarations. The checker does not use comment regions as
ordering metadata. The global `<agents-root>` `bun run test:lint` gate runs
Biome, declaration-order inspection for every TypeScript source, and the
all-skill validator as distinct checkers; a failure in any checker fails the
gate and must be reported separately. It always reports both gate results and
fails when either fails. A healthy run emits one checked-file summary; failure
output retains only failed or blocked paths and their action packets.

If a packet is absent or a structural result is ambiguous, Do not invent a
reorder. Do not add comment-defined regions or use comments as ordering
metadata.
Do not invent a reorder when the action packet is absent.

## 5. Output & Completion Contract

Success returns per-path Biome, TypeScript or `not-applicable`, and
declaration-order results, with all applicable commands passing under shared
rules. The JSON receipt and exit status are the proof. The global final gate,
when selected, remains the final decision.

Failure names the checker, selected path, diagnostic, barrier/cycle, or missing
action packet. Do not claim success from a focused partial result, and do not
modify target configuration or unrelated paths as recovery.

## 6. Evaluation Anchors

- **Canonical:** A selected JavaScript path reports Biome plus
  TypeScript `not-applicable`; a selected TypeScript path reports strict
  `--noEmit` checking.
- **Boundary:** A barrier, cycle, duplicate, shadowed name, syntax error, or
  action packet with no permitted reorder is reported without crossing it.
- **Challenge:** A noncanonical source is fixed only by the returned
  action packet's whole-declaration reorder, then the identical command proves
  status `passed` with a null packet.
- **Independent verifier:** Command receipts, CST analysis, and the shared
  lint/type gate independently verify the result.
