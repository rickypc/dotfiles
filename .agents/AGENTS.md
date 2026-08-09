# Universal Assistant Runtime

This policy is the shared root contract for a portable coding-assistant
runtime. It may be installed at `<project-root>/.agents` for one project or at
`~/.agents` as the machine-wide fallback. A project-local runtime and skill
always take precedence over the home-directory fallback.

## 1. Read this first: decision order

Apply these decisions in order before acting:

1. Resolve the active `<agents-root>` and project root.
2. Read the applicable parent, project, and coding-assistant policies.
3. Classify the request as read-only analysis/review/reporting or an authorized
   change/build request.
4. Select the owning skill or script. Read its `argument-hint`, complete
   `## 2. Usage`, parser/entrypoint, and any owner-specific command tables.
5. Gather the smallest sufficient repository and private-context evidence.
6. Confirm scope, authorization, protected-file boundaries, and the proof needed
   to close the work.
7. Make one compatible change batch, run focused checks, then run the configured
   final gate once.

The catalog below is a quick-start aid, not an exhaustive list. A missing row
does not mean a skill is unavailable: inspect the resolved `<agents-root>/skills/`
directory, project-local skills, and applicable plugin/runtime skills.

## 2. Scope and authorization

Analysis, explanation, review, diagnosis, and status requests are read-only.
They authorize inspection and evidence collection, not implementation,
redesign, deletion, external messages, commits, pushes, or other state changes.
Do not infer authorization from a diagnostic request.

A request to change or build authorizes only the named systems, files, and
people in scope. Make the minimum compatible change, preserve unrelated user
changes, and ask when evidence leaves a material decision unresolved. Do not
broaden a local repair into cleanup, migration, refactoring, or external
coordination without explicit scope.

Use this evidence order:

1. Current user request and explicit decisions.
2. Applicable runtime, project, and coding-assistant policies.
3. Verified repository/file evidence.
4. Validated private knowledge.
5. Clearly labelled assumptions, never hidden defaults.

When a required fact is unknown, state the unknown and stop at the clarification
or repair boundary. Never fill it with a plausible default.

## 3. Workspace and instruction precedence

Resolve `<agents-root>` by walking upward from the current project directory and
selecting the first `.agents/` directory; if none exists, use `~/.agents`.
`<project-root>` is the parent of `<agents-root>`.

Instruction inheritance is additive:

- `~/.agents/AGENTS.md` is the parent policy.
- `<project-root>/AGENTS.md` may narrow scope or strengthen requirements but
  must say that it extends the parent; it must not replace or omit it.
- A coding-assistant-specific `AGENTS.md` follows the same additive rule.
- Resolve a project-local skill before the global skill with the same name.

Tool configuration follows the same direction. The project policy `extends`
the shared `<agents-root>/biome.jsonc` configuration and may only strengthen rules or narrow
file scope. Bun has no native `bunfig.toml` inheritance: use the shared
`<agents-root>/bunfig.toml` directly, preferably through a symlink, or pass it
explicitly with Bun's `--config`. Duplicating it requires proof that it is an
exact synchronized strengthening.

Do not create `aidx.json` merely to repeat the default `bun run test` gate. Add
it only for a different, explicitly justified project gate. It is compact JSON
data with an optional string `finalGate`; AIDX reads it and never executes it as
a program.

## 4. Non-negotiable safety boundaries

### Protected `.agents` configuration

For every resolved `<project>/.agents`, including `~/.agents`, these are
user-owned configuration and policy inputs:

```text
.gitignore
biome.jsonc
bunfig.toml
LICENSE
NOTICE
package.json
tsconfig.json
```

Never edit, create, delete, rename, move, format, autofix, stage, reset, or
indirectly mutate these files. Read-only inspection is allowed. If a requested
solution requires one, show the exact required user action or proposed diff and
stop. Automated writes under `<project>/.agents` must use an explicit allowlist
that excludes these paths; never run a whole-directory write or autofix.

The assistant may update this `AGENTS.md` only when the user explicitly asks
for an instruction or guardrail change. That exception does not permit changes
to the protected configuration files.

### Runtime and reusable-content boundaries

- MCP tools are unavailable in this runtime. Use the approved skills and their
  caller-facing wrapper contracts.
- Reusable guidance uses `<agents-root>`, `<project-root>`,
  `<repo-search-index>`, and source-relative links. Never embed a concrete
  username, home directory, machine path, or credential in shared guidance.
- There is no universal `.agents/references` directory. Never invent or
  hardcode one.
- Retired workflow references are not executable routing. Use active skills,
  current references, and current command contracts.
- Executable scripts own their implementation by default. Put code in `utils/`
  only for a genuinely shared production boundary with at least two consumers
  or an explicitly owned reusable boundary such as the quality engine. Do not
  add a global `tools/` directory or a wrapper that only relocates one helper.
- During ordinary work, treat `.agents` as read-only except the documented
  temporary-intent namespace and explicitly requested exact runtime-asset work.

## 5. Skill routing quick start

Resolve project-local skills first. For every selected skill, read frontmatter
`argument-hint` for the compact caller/UI shape, then read its complete
`## 2. Usage` section and any owner-specific command or information tables.
`argument-hint` is only a hint; the Usage section and owned tables are the
authoritative grammar and may contain alternate routes, optional arguments, or
additional boundaries.

| Skill | Quick-start input | Use when |
| --- | --- | --- |
| `/aidp` | `<goal-and-concerns>` | An incomplete or complete request needs evidence intake, clarification, and one explicit six-section execution plan handed to `/aidx`. |
| `/aidx` | `<plan-path-relative-or-absolute>` | One materialized six-section plan needs deterministic execution, delegated ownership, fresh verification, and mapped completion or repair evidence. |
| `/repo-search` | `<approved-root> <query>` | Repository, symbol, call-path, architecture, or code-text discovery is needed; read Usage for inspection routes and the complete wrapper contract. |
| `/knowledge-base` | `<operation> <private-kb-root> <scope-or-request>` | A private-KB decision, policy, prior lesson, capture, reconciliation, or OKF validation is needed. |
| `/biome-tsc-checker` | `<path> [path...]` | Explicit JavaScript or TypeScript paths need Biome, strict TypeScript, and declaration-order checks. |
| `/bun-test-generator` | `<sut-path> <all\|method-list\|method-range>` | A selected JavaScript/TypeScript unit needs quality-focused Bun tests or an existing Jest test must be converted. |
| `/frontend-design` | `<ui-brief> <affected-screens> <design-system> <acceptance-criteria>` | A user-facing web UI is created, redesigned, or visually refreshed. |
| `/react` | `<react-or-react-native-scope> <approved-design> <acceptance-criteria>` | React or React Native implementation is in scope after design/content inputs are approved. |
| `/playwright-test-generator` | `<criteria> <project-root> <playwright-runner>` | Browser flows, responsive layout, or an explicit browser-performance budget need retained project-local regression tests. |
| `/content-writer` | `<objective> <audience> <format> <constraints> <citation-style>` | Research-backed content must be drafted, refreshed, or validated. |
| `/md-compress` | `begin\|finalize <absolute-markdown-path>` | Durable Markdown needs lossless compression with a verified temporary backup. |
| `/skill-manager` | `<operation> [arguments]` | Any skill needs to be created, updated, reviewed, renamed, synchronized, optimized, validated, or repaired. |

Skill ownership rules:

- `/skill-manager` owns every skill-package lifecycle request, including
  frontmatter, resources, matrices, prose/link review, validation, and closure.
  Read [the owning skill](<agents-root>/skills/skill-manager/SKILL.md>). The
  reusable path is also `<agents-root>/skills/skill-manager/SKILL.md`.
- `/repo-search` owns caller-facing repository discovery through its wrapper;
  do not bypass it with an alternate index or backend. Read [the owning skill](<agents-root>/skills/repo-search/SKILL.md>). The
  reusable path is also `<agents-root>/skills/repo-search/SKILL.md`.
- `/knowledge-base` alone owns the configured private-KB root and its lifecycle.
  Read [the owning skill](<agents-root>/skills/knowledge-base/SKILL.md>). The
  reusable path is also `<agents-root>/skills/knowledge-base/SKILL.md`.
- `/bun-test-generator` owns every JavaScript/TypeScript test addition,
  conversion, repair, rename, or deletion before the test is touched.
- `/playwright-test-generator` owns retained browser acceptance coverage and
  does not replace unit coverage or modify global dependencies.

## 6. Evidence, discovery, and context

For every nontrivial workflow, use `/knowledge-base` for durable prior context
and lesson capture. Use `/repo-search` for repository files, symbols, call
paths, and code text through its complete wrapper contract. Do not read whole
files when a targeted discovery or inspection receipt answers the question;
read policy, owner, and contract files fully when they define the boundary.

Repository evidence establishes what exists and how it flows. Private knowledge
supplies business intent, terminology, ownership, and precedent. Record facts,
receipts, evidence limits, conflicts, and unresolved decisions before asking a
question or making a plan.

Batch independent reads and distinct checks when safe, but never run the same
checker, command, query, or final gate concurrently. Reject duplicate
normalized queries in every batch API. For AIDX, use one `advance-batch` request
for consecutive prepared non-gated transitions; use an individual transition
when the state contract requires a user gate, test receipt, repair receipt, or
other non-batchable event.

### AIDP and AIDX boundary

Use AIDP for clarification, evidence intake, and one approved six-section plan:
`Role`, `Objective`, `Core Directives`, `Execution Steps`, `Constraints`, and
`Inputs to Process`. Use AIDX in fresh context for deterministic construction,
delegation, verification, repair/re-plan behavior, and one final gate. AIDX
accepts the absolute or relative plan path defined by its own Usage contract;
do not parse or reinterpret the plan in the caller.

## 7. Coding and test changes

- Make the minimum change satisfying the verified behavior. Reuse existing
  code, types, patterns, configuration, and test helpers before adding an
  abstraction. Remove code, tests, configuration, documentation, or references
  made dead by the change.
- Do not remove pre-existing dead code on assumption. Report evidence and ask
  whether to include separate cleanup.
- Before changing shared production code, a canonical shared test, or a shared
  mock registration, build a bounded impact map with `/repo-search`: direct
  importers/callers, public consumers, same-process tests, compatibility risks,
  and focused proof for each risk. If the map cannot be established, stop.
- Never add an unbounded top-level `mock.module()` to a shared Bun suite. Bun
  mocks can persist across test files in one process; prove compatibility for
  every same-process consumer, or use test-local injection/an isolated boundary.
- For every JavaScript/TypeScript test change, invoke `/bun-test-generator`
  first, use the real SUT, mock every external boundary, run
  `validate-boundaries`, and then use `/biome-tsc-checker` on selected paths. A
  passing test, coverage result, or skill validation cannot substitute for the
  required generator receipt. Do not use `mock.restore()` as proof that a
  shared same-process mock is isolated.
- For retained browser acceptance coverage, invoke
  `/playwright-test-generator` with the selected project's local runner.

Use a failure-first repair loop for multi-lane work: run one baseline discovery
or validation pass, collect independent failures, apply compatible repairs as
one batch, run focused checks, and run the final gate once. Keep a concise
command/result/next-action ledger. Never rerun an unchanged full gate after
each individual fix.

## 8. Command, script, and structured-data contracts

Before invoking any script or skill command, read its owning command catalog and
parser/entrypoint. Bundled `scripts/` own repeated or fragile operations;
inspect `--help` only when the owning skill does not already provide the
contract. Verify exact arity, positional meanings, transport type
(path, inline string, or temporary request file), and JSON schema. Validate the
request with the owner parser before any side effect. A rejected invocation is
a command-contract defect to repair, not evidence and not a reason to repeat
the same malformed command.

### String-only JSON boundary

When a tool or script accepts a string containing JSON, pass a string, never an
object. For backtick-, dollar-, quote-, or newline-rich JSON that must be
written to disk, use the shared TypeScript writer:

```text
cat <absolute-request-source-path> | bun <agents-root>/scripts/write-json.ts <absolute-json-output-path>
```

Run `mktemp` alone first and retain the absolute output path it prints. Create
the request source through the approved file editor, then run the exact writer
pipe. Do not use a heredoc, shell redirection, shell variables, command
substitution, guessed temp path such as `/tmp` or `/private/tmp`, object-valued
tool call, Python, or `JSON.stringify(request)` fallback. Pass JSON as string
`content` through the writer. The writer reads stdin, validates JSON, pretty-prints
it, and permits only an output path inside the operating system temp directory.
After materialization succeeds, invoke the owning command separately with the
same literal path.

The exact writer command contract is preserved as:
`cat <absolute-request-source-path> | bun <agents-root>/scripts/write-json.ts
<absolute-json-output-path>`

The writer entrypoint remains `write-json.ts`; the owning skill determines the
`request` schema and lifecycle, and the `request` itself follows that owner's
contract.

### Temporary paths

Every temporary path must be printed by standalone `mktemp` or derived from
`os.tmpdir()` evidence. Never guess a platform temp path, reuse a placeholder,
or create multiple temp directories for one workflow when one OS temp directory
with distinct files is sufficient.

## 9. Validation, gates, and closeout

After the complete implementation batch:

1. Run the focused checks for changed behavior and affected boundaries.
2. Run the selected project final gate exactly once.
3. If it fails, collect all compatible repairs, apply them as one repair batch,
   and run the same final gate exactly once again.

The final gate is the project-approved `finalGate` in `aidx.json`, otherwise
`.agents`'s `bun run test`, otherwise `bun run test`. All required checks in
the selected gate must pass; a matrix score, unit subset, coverage result,
intention, or partial green receipt never closes the work.

Closeout reports exact changed files, commands and results, validation/resource/
link findings, owner receipts, limitations, and remaining follow-up. Preserve a
resumable record when work spans turns. Capture durable lessons only when they
are specific, verified, and owned by the knowledge base.

## Appendix A: repo-search command catalog

The caller-facing wrapper is:

```bash
bun <agents-root>/scripts/repo-search.ts "<approved-root>" "<query>"
bun <agents-root>/scripts/repo-search.ts inspect "<approved-root>" "<absolute-jsonl-request-path-under-os-tempdir>"
```

| Command or information | Arguments | When to use | Additional information |
| --- | --- | --- | --- |
| `list-projects` | `—` | Resolve approved roots and matching indexes | Select by explicit indexed root. |
| `index-status` | `<repo-search-index>` | Check readiness before a read | Follow the indexing boundary and receipt if not ready. |
| `architecture` | `<repo-search-index>` | Read indexed architecture | Returns one wrapper-owned result. |
| `schema` | `<repo-search-index>` | Verify graph identity fields | Use before relying on a newly observed identity field. |
| `snippet` | `<repo-search-index>` `<qualified-name>` | Read one indexed code snippet | Request the smallest fragment needed. |
| `search-graph` | `<repo-search-index>` `<query>` `<positive-limit>` | Search graph nodes | A match requires normalized identity-field evidence. |
| `search-code` | `<repo-search-index>` `<literal-pattern>` `<positive-limit>` | Search indexed code text | Use after graph search or as a declared inspection operation. |
| `query` | `<repo-search-index>` `<graph-query>` `<positive-limit>` | Run a bounded graph query | Keep the query narrow and record the receipt. |
| `trace` | `<repo-search-index>` `<qualified-name>` `<inbound\|outbound>` `<positive-depth>` | Trace callers or callees | Direction is restricted to `inbound` or `outbound`. |
| `discover` | `<approved-root>` `[repo-search-index]` `<query>` | Any code, symbol, call-path, architecture, or literal-text question | Path-only works without an index; indexed form tries graph/code search, then returns one fallback receipt. |
| `inspect` | `<approved-root>` `<absolute-jsonl-request-path-under-os-tempdir>` | Several independent reads for one decision | Returns one resolved index, readiness result, and ordered receipt per read. |
| `inspection JSONL` | `architecture(path)`, `schema`, `search-graph(namePattern,label,limit)`, `snippet(qualifiedName)`, `trace(qualifiedName,direction,depth)`, `search-code(pattern,limit)` | Batch independent reads | The request file must be under the operating-system temp directory. |

Inspection JSONL operations:

```jsonl
{"operation":"architecture","path":"<directory-prefix>"}
{"operation":"schema"}
{"operation":"search-graph","namePattern":"<regular-expression>","label":"<graph-label>","limit":<positive-integer>}
{"operation":"snippet","qualifiedName":"<qualified-name>"}
{"operation":"trace","qualifiedName":"<qualified-name>","direction":"<inbound-or-outbound>","depth":<positive-integer>}
{"operation":"search-code","pattern":"<literal-pattern>","limit":<positive-integer>}
```

`OKF` means Open Knowledge Format: the Markdown/frontmatter representation and
indexing convention used by the private KB. It describes how knowledge is
represented, not what the knowledge is about. The private-KB root is independent
of `<agents-root>` and cannot be selected or overridden by a project runtime.
