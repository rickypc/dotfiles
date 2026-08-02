# Universal assistant runtime

This directory is the machine-wide assistant runtime for projects that do not
ship their own `.agents/skills/aidlc`. A project-local skill always takes
precedence over this global one.

Resolve `<agents-root>` by walking up from the current project directory,
looking for `.agents/`. Use the first one found; if none is found, fall back to
`~/.agents`. `<project-root>` is always the parent of `<agents-root>`.

- Use `skills/aidlc/SKILL.md` for lifecycle work; do not copy or fork its
  runtime into a project.
- Use `skills/codebase-memory/SKILL.md` for code discovery and
  `skills/knowledge-base/SKILL.md` for external private knowledge. Do not
  bypass either with independent CBM, MCP, CLI, or grep calls.
- Universal executable scripts live in `scripts/`; reusable TypeScript lives in
  `utils/`. Do not add a global `tools/` directory or platform-specific hooks.
- Temporary workflow intents are centralized at
  `aidlc/<cbm-index>/intents/<id>.md` and must be read/written through the
  gray-matter-based AIDLC scripts.
- During ordinary work, treat all of `.agents` as read-only except that one
  temporary-intent namespace. Do not edit, create, delete, or move runtime
  assets. The user must explicitly request an exact runtime asset change; the
  canonical boundary is in `aidlc/protocols/runtime.md`.
## Skill catalog

Resolve a project-local skill before this global catalog. Invoke a skill when
its selection rule applies; do not probe its scripts with `--help` when the
skill already supplies the command contract.

| Skill | Required input | Use when |
| --- | --- | --- |
| `aidlc` | `<intent-summary>` `[--ui]` `[--initial-record '<stage-outcomes-json>']`; use the priority-ordered catalog rendered by `utils/aidlc/command-contract.ts`. | A code change needs the four-phase intent, approval, one final gate, and KB closeout route. `start` derives `<agents-root>` and `<project-root>` from its executing script. |
| `codebase-memory` | `<approved-root>` `<cbm-index>` `<query>` or `<approved-root>` `<inspection-request-jsonl-path>`; read its command catalog first. | Any code, symbol, call-path, architecture, or code-text discovery is needed. |
| `knowledge-base` | `<private-kb-root>` plus selected catalog inputs; reconciliation uses `<absolute-request-path>`. | A private-KB decision, policy, prior lesson, capture, reconciliation, or OKF validation is needed. Do not use standalone reconciliation inside an AIDLC closeout. |
| `biome-tsc-checker` | `<path>` (one or more). | Explicit JavaScript or TypeScript paths need Biome, strict TypeScript, and declaration-order checks. |
| `bun-test-generator` | `<sut-path>` `<all \| method-list \| method-range>`. | A selected JavaScript/TypeScript unit needs quality-focused Bun tests or an existing Jest test must be converted. |
| `frontend-design` | `<ui-brief>` `<affected-screens>` `<design-system>` `<acceptance-criteria>`. | A user-facing web UI is created, redesigned, or visually refreshed. Define intentional, accessible, responsive UI behavior before implementation. |
| `playwright-test-generator` | `<criteria>` `<project-root>` `<playwright-runner>`. | Browser flows, responsive layout, or an explicit browser-performance budget need retained project-local regression tests. Never use MCP, browser extensions, implicit installs, or global dependencies. |
| `content-writer` | `<objective>` `<audience>` `<format>` `<constraints>` `<citation-style>`. | Research-backed content must be drafted, refreshed, or validated. |
| `md-compress` | `begin <markdown-path>` then returned `finalize <markdown-path>`. | Durable Markdown needs lossless compression with a verified temporary backup. |
| `skill-manager` | `<intent-id>` `<evaluation-phase>` `<matrix-jsonl-path>` `<skill-file-path>`; requires an active AIDLC intent as a prerequisite; read its command catalog first. | A skill needs to be created, reviewed, renamed, synchronized, optimized, or validated. |

`knowledge-base` alone owns the private-KB root. `codebase-memory` alone owns
CBM command selection and fallback search. The arguments above are selection
inputs, not executable grammar. Read the selected skill’s canonical command
catalog before running a command.

## Code changes

This policy applies to every code-related change, whether or not AIDLC is in
use.

- Make the minimum change that satisfies the verified requested behavior; do
  not broaden the patch for nearby cleanup, refactoring, or style preference.
- Reuse existing project code, types, patterns, configuration, and test helpers
  when they fit the requested behavior. Add a new abstraction only when the
  verified extension point cannot support it clearly.
- Remove code, tests, configuration, documentation, and references made dead
  by this change. Do not leave duplicate implementations, obsolete branches,
  unreachable paths, or stale commands behind.
- Do not remove pre-existing dead code that this change did not create or
  replace on assumption. Report the exact evidence and ask the user whether to
  include that separate cleanup.
- For every JavaScript or TypeScript test addition or modification, invoke
  `bun-test-generator` first. Use its behavior matrix, mock or inject every
  external boundary, run `validate-boundaries`, then use `biome-tsc-checker`
  for selected paths. The one AIDLC final gate remains the only final decision.
- For retained browser acceptance coverage, invoke `playwright-test-generator`
  instead. It uses the selected project's local Playwright runner and does not
  replace unit coverage or modify global dependencies.
