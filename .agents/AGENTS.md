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

Do not create `aidx.json` merely to repeat the default final gate. The AIDX
default is `bun run test`; add `aidx.json` only when the project needs a
different, explicitly justified final gate. It is a compact JSON object with an
optional string `finalGate` property. AIDX reads it as data; it is never
executed as a program.

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

### String-only structured payload boundary

When a tool or script accepts a string containing JSON, pass a string, never an
object. For any backtick-, dollar-, quote-, or newline-rich JSON that must be
written to disk, use the shared TypeScript writer:

```text
bun <agents-root>/scripts/write-json.ts "<absolute-json-output-path>" <<'JSON'
<valid-json-object-or-array>
JSON
```

Use this as two separate commands. First run `mktemp` alone and retain the
absolute path it prints. Do not guess `/tmp`, `/private/tmp`, or a platform
specific path: the writer accepts only the actual operating system
`os.tmpdir()`. In the next command, pass that printed path literally as the
writer's one output-path argument. Do not use shell variables, command
substitution, or backtick command substitution in that command. Keep the
heredoc delimiter exactly quoted as `<<'JSON'`. For Markdown backticks or
dollar signs inside JSON strings, use the JSON escapes `\\u0060` and
`\\u0024` so shell-sensitive characters never enter the command text; the
writer decodes them into the intended content. After materialization succeeds,
invoke the owning command in a separate command with the same literal path.

Use exactly one absolute output-path argument; the writer reads JSON from
stdin, validates it before writing, pretty-prints it, and permits only paths
inside `os.tmpdir()`. Quote the heredoc delimiter exactly as shown so payload
text is not shell-evaluated. Never put backtick-rich JSON in a double-quoted
shell argument, pass an object to a string-only `content` field, or improvise a
Python/inline writer. For JSON file materialization, invoke `write-json.ts`
directly and bypass the built-in write tool entirely; there is no
`JSON.stringify(request)` tool-call fallback. The owning skill determines the
`request` schema and lifecycle; the request itself still follows that owner's
schema.

- Use `<agents-root>/skills/aidlc/SKILL.md` for lifecycle work. Keep the
  selected runtime's assets together and use its own scripts and utilities.
- Use `<agents-root>/skills/skill-manager/SKILL.md` for every skill creation,
  update, rename, synchronization, review, optimization, or repair request.
  Skill Manager owns the deterministic scaffold, frontmatter validation,
  prose/link review, quality matrix, and closeout; do not route skill package
  work through another skill.
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
| `/aidx` | `<goal-and-concerns>` or `resume <goal-id>` or `status <goal-id>` | An explicit goal needs the question, approved-plan, implementation, test, repair, lesson, and resumable AIDX lane. AIDX is LLM-triggered and does not use the AIDLC route. |
| `/codebase-memory` | `<approved-root>` `<cbm-index>` `<query>` or `<approved-root>` `<inspection-request-jsonl-path>`; read its command catalog first. | Any code, symbol, call-path, architecture, or code-text discovery is needed. |
| `/knowledge-base` | `<private-kb-root>` plus selected catalog inputs; reconciliation uses `<absolute-request-path>`. | A private-KB decision, policy, prior lesson, capture, reconciliation, or validation of an OKF-formatted concept is needed. Do not use standalone reconciliation inside an AIDLC closeout. |
| `/biome-tsc-checker` | `<path>` (one or more). | Explicit JavaScript or TypeScript paths need Biome, strict TypeScript, and declaration-order checks. |
| `/bun-test-generator` | `<sut-path>` `<all \| method-list \| method-range>`. | A selected JavaScript/TypeScript unit needs quality-focused Bun tests or an existing Jest test must be converted. |
| `/frontend-design` | `<ui-brief>` `<affected-screens>` `<design-system>` `<acceptance-criteria>`. | A user-facing web UI is created, redesigned, or visually refreshed. Define intentional, accessible, responsive UI behavior before implementation. |
| `/react` | `<react-or-react-native-scope>` `<approved-design>` `<acceptance-criteria>`. | React or React Native implementation is in scope. Apply the shared implementation contract after design and finalized UI content are available. |
| `/playwright-test-generator` | `<criteria>` `<project-root>` `<playwright-runner>`. | Browser flows, responsive layout, or an explicit browser-performance budget need retained project-local regression tests. Never use MCP, browser extensions, implicit installs, or global dependencies. |
| `/content-writer` | `<objective>` `<audience>` `<format>` `<constraints>` `<citation-style>`. | Research-backed content must be drafted, refreshed, or validated. |
| `/md-compress` | `begin <markdown-path>` then returned `finalize <markdown-path>`. | Durable Markdown needs lossless compression with a verified temporary backup. |
| `/skill-manager` | `init <absolute-skill-path> <description>`, `validate <absolute-skill-path>`, or the selected review/evaluation command; read its command catalog first. | Any skill, including AIDX and legacy skills, needs to be created, updated, reviewed, renamed, synchronized, optimized, or validated. |

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
- Before changing shared production code, a canonical shared test, or a
  shared mock registration, build a bounded impact map with
  `/codebase-memory`: direct importers and call sites, public command
  consumers, tests loaded by the same command/process, and compatibility or
  contamination risks. Record the affected consumers and the focused checks
  that cover each risk before editing. If the map cannot be established from
  repository evidence, stop before the mutation and ask for direction.
- A shared Bun suite must never receive an unbounded top-level `mock.module()`
  change. Bun module mocks can persist across test files in one process, so
  identify every same-process consumer first and prove that the mock is
  compatible with all of them. Prefer test-local dependency injection or an
  isolated process/module boundary; do not assume `mock.restore()` or test
  file boundaries undo module registration. If safe isolation is not proven,
  do not change the shared harness.
- Before invoking any script or skill command, read its owning command catalog
  and parser/entrypoint, then verify the exact arity, positional meanings,
  transport type (path, inline string, or temporary request file), and JSON
  schema. Validate the request with the owning parser before a side effect.
  Treat a rejected invocation as a command-contract defect to repair, not as
  evidence and not as a reason to repeat the same malformed command.
- Use a failure-first repair loop for multi-lane work: run one baseline
  discovery/validation pass, collect all independent failures, apply compatible
  repairs as one batch, run focused checks for that batch, and run the final
  gate once. Keep a short command/result/next-action ledger. Never rerun the
  full gate after each individual fix or repeat an unchanged command whose
  contract and inputs have not changed.
- For every JavaScript or TypeScript test addition or modification, invoke
  `/bun-test-generator` first. Use its behavior matrix, mock or inject every
  external boundary, run `validate-boundaries`, then use `/biome-tsc-checker`
  for selected paths. The one AIDLC final gate remains the only final decision.
- For retained browser acceptance coverage, invoke `/playwright-test-generator`
  instead. It uses the selected project's local Playwright runner and does not
  replace unit coverage or modify global dependencies.

## Non-negotiable execution guardrails

For every nontrivial workflow, invoke `/knowledge-base` for durable prior context and lesson capture. Use `/codebase-memory` as the primary authority for repository files, symbols, call paths, and code text; do not read whole files when a targeted discovery or inspection receipt answers the question. There is no universal `.agents/references` directory: never invent or hardcode one. Before any code edit, collect the smallest sufficient CBM/KB receipts.

Batch independent reads and distinct checks when they are safe, but never run the same checker, command, query, or final gate concurrently. Reject duplicate normalized queries in every batch API. For AIDX, use one `advance-batch` request for consecutive prepared non-gated transitions; issue an individual transition only when the state contract requires a user gate, test receipt, repair receipt, or other non-batchable event.

All temporary paths must be printed by a standalone `mktemp` command or derived from `os.tmpdir()` evidence. Never guess a platform temp path, reuse a placeholder path, or create multiple temp directories for one workflow when one OS temp directory and distinct files are sufficient. After a complete implementation batch, run the configured final gate exactly once. If it fails, make all compatible repairs together and run that final gate exactly once for the repair batch.

## JSON materialization fallback

The canonical JSON writer always receives exactly one absolute output path that was printed by standalone mktemp or proven under os.tmpdir(). Send the JSON as text through the writer stdin. If the shell heredoc form is rejected by the runtime, keep the same writer and path, open one bounded stdin session, write the JSON text, and close stdin; do not switch to an object-valued tool call, Python, a guessed path, or JSON.stringify inside the command. Use escaped Unicode for backticks and dollar signs inside JSON strings, and verify the writer receipt before the next command.
