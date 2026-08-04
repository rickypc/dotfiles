# Universal assistant runtime

This portable runtime may be installed at `<project-root>/.agents` for one
project or at `~/.agents` as a machine-wide fallback. It has the same runtime
behavior and relative asset layout in either location. A project-local skill
always takes precedence over the home-directory fallback.

## Instruction and configuration inheritance

`~/.agents/AGENTS.md` is the parent policy for projects using this runtime.
A project `AGENTS.md` is additive: it may narrow scope or strengthen a
requirement, but it must not say that it replaces, supersedes, or omits the
parent policy. Read the parent policy first, then apply project-specific rules;
when wording conflicts, retain the stricter rule unless the user explicitly
directs an exception. Every project `AGENTS.md` must state that it extends this
parent policy near its top.

Tool configuration follows the same direction. A project Biome configuration
must extend the shared `<agents-root>/biome.jsonc` and may only add stricter
rules or narrower file scope. Bun's `bunfig.toml` has no native `extends`
mechanism, so a project must use the shared `<agents-root>/bunfig.toml`
directly (a symlink is preferred) or pass it explicitly with Bun's `--config`
option; duplicating it is permitted only when the project proves it is an
exact synchronized strengthening. Never remove shared coverage or lint/type
gates to make a project green.

Do not create `aidlc.config.json` merely to repeat the default final gate. The
AIDLC default is `bun run test`; add that file only when the project needs a
different, explicitly justified final gate.

Resolve `<agents-root>` by walking up from the current project directory,
looking for `.agents/`. Use the first one found; if none is found, fall back to
`~/.agents`. `<project-root>` is always the parent of `<agents-root>`.

### Immutable `.agents` configuration boundary

For every resolved `<project>/.agents` directory, including the global
`~/.agents` directory, the following files are user-owned configuration and
policy inputs:

```text
.gitignore
biome.jsonc
bunfig.toml
LICENSE
NOTICE
package.json
tsconfig.json
```

The assistant MUST NOT edit, create, delete, rename, move, format, autofix,
stage, reset, or otherwise mutate any of these files. This prohibition applies
even when a lint, type, test, build, hook, or generated-artifact failure would
be resolved by changing one of them, and even when a broad command such as a
formatter, linter, package tool, or generated-file tool could change one
indirectly. Read-only inspection is allowed.

If satisfying the user's task requires a change to one of these files, stop
before making that change, show the exact required user action or proposed
diff, and ask the user to make it. Do not assume approval from a request to
fix the surrounding code. All automated writes under `<project>/.agents`
MUST use an explicit allowlist that excludes these protected paths; never run
a whole-directory write or autofix that could include them.

The assistant may update this `AGENTS.md` policy only when the user explicitly
requests an instruction or guardrail change; that exception does not permit
changes to the protected files above.

- Use `<agents-root>/skills/aidlc/SKILL.md` for lifecycle work. Keep the
  selected runtime's assets together and use its own scripts and utilities.
- Use `<agents-root>/skills/codebase-memory/SKILL.md` for code discovery and
  `<agents-root>/skills/knowledge-base/SKILL.md` for private knowledge stored
  outside the runtime at the configured private-KB root. Do not bypass either
  with independent discovery calls.
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
| `/aidlc` | `<intent-summary>` `[--ui]` `[--initial-record '<stage-outcomes-json>']`; use the priority-ordered catalog rendered by `utils/aidlc/command-contract.ts`. | A code change needs the four-phase intent, approval, one final gate, and KB closeout route. `start` derives `<agents-root>` and `<project-root>` from its executing script. |
| `/codebase-memory` | `<approved-root>` `<cbm-index>` `<query>` or `<approved-root>` `<inspection-request-jsonl-path>`; read its command catalog first. | Any code, symbol, call-path, architecture, or code-text discovery is needed. |
| `/knowledge-base` | `<private-kb-root>` plus selected catalog inputs; reconciliation uses `<absolute-request-path>`. | A private-KB decision, policy, prior lesson, capture, reconciliation, or validation of an OKF-formatted concept is needed. Do not use standalone reconciliation inside an AIDLC closeout. |
| `/biome-tsc-checker` | `<path>` (one or more). | Explicit JavaScript or TypeScript paths need Biome, strict TypeScript, and declaration-order checks. |
| `/bun-test-generator` | `<sut-path>` `<all \| method-list \| method-range>`. | A selected JavaScript/TypeScript unit needs quality-focused Bun tests or an existing Jest test must be converted. |
| `/frontend-design` | `<ui-brief>` `<affected-screens>` `<design-system>` `<acceptance-criteria>`. | A user-facing web UI is created, redesigned, or visually refreshed. Define intentional, accessible, responsive UI behavior before implementation. |
| `/react` | `<react-or-react-native-scope>` `<approved-design>` `<acceptance-criteria>`. | React or React Native implementation is in scope. Apply the shared implementation contract after design and finalized UI content are available. |
| `/playwright-test-generator` | `<criteria>` `<project-root>` `<playwright-runner>`. | Browser flows, responsive layout, or an explicit browser-performance budget need retained project-local regression tests. Never use MCP, browser extensions, implicit installs, or global dependencies. |
| `/content-writer` | `<objective>` `<audience>` `<format>` `<constraints>` `<citation-style>`. | Research-backed content must be drafted, refreshed, or validated. |
| `/md-compress` | `begin <markdown-path>` then returned `finalize <markdown-path>`. | Durable Markdown needs lossless compression with a verified temporary backup. |
| `/skill-manager` | `<intent-id>` `<evaluation-phase>` `<matrix-jsonl-path>` `<skill-file-path>`; requires an active AIDLC intent as a prerequisite; read its command catalog first. | A skill needs to be created, reviewed, renamed, synchronized, optimized, or validated. |

`/knowledge-base` alone owns the private-KB root. `/codebase-memory` alone owns
CBM command selection and fallback search. The arguments above are selection
inputs, not executable grammar. Read the selected skill’s canonical command
catalog before running a command.

In this runtime, `OKF` means Open Knowledge Format: the Markdown/frontmatter
record format and indexing convention used by the private KB. It describes how
knowledge is represented, not what the knowledge is about; the knowledge-base
skill owns that lifecycle and distinction.

Private KB data is independent of the selected `<agents-root>`. The
`/knowledge-base` skill resolves one configured central private-KB root; neither
a project-local runtime nor the home-directory runtime may select or override
it.

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
  `/bun-test-generator` first. Use its behavior matrix, mock or inject every
  external boundary, run `validate-boundaries`, then use `/biome-tsc-checker`
  for selected paths. The one AIDLC final gate remains the only final decision.
- For retained browser acceptance coverage, invoke `/playwright-test-generator`
  instead. It uses the selected project's local Playwright runner and does not
  replace unit coverage or modify global dependencies.
