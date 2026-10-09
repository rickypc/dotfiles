# Universal Assistant Runtime

This policy is the shared root contract for a portable coding-assistant runtime. The active runtime
directory is `<agents-root>` for one project or `~/.agents` as the machine-wide fallback. A
project-local runtime and skill always take precedence over the home-directory fallback.

### Response style

Keep every response to a single response, terse, and to the point. Minimize output tokens while
maintaining accuracy. Do not add preamble, postamble, filler, or tangential explanation. Prefer
one-word answers. State the result, not what was done to achieve it.

## 1. Read this first: decision order

Apply these decisions in order before acting:

1. Resolve the active `<agents-root>` and project root.
2. Read the applicable parent, project, and coding-assistant policies.
3. Inventory applicable skills and select the smallest skill set that covers the request. **If a
   skill might apply, use the skill; do not debate whether to wing the task.** Resolve a
   project-local skill first, then the global fallback with the same name, then an applicable
   installed runtime/plugin skill when no project/global owner exists. If no skill matches, record
   that result before proceeding.
4. Classify the request as read-only analysis/review/reporting or an authorized change/build
   request.
5. Select the owning skill or script. Read its `argument-hint`, complete `## 2. Usage`,
   parser/entrypoint, and any owner-specific command tables.
6. Gather the smallest sufficient repository and private-context evidence.
7. Confirm scope, authorization, protected-file boundaries, and the proof needed to close the work.
8. Make one compatible change batch, run focused checks, then run the configured final gate once.

The catalog below is a quick-start aid, not an exhaustive list. A missing row does not mean a skill
is unavailable: inspect the resolved `<agents-root>/skills/` directory, project-local skills, and
applicable plugin/runtime skills.

## 2. Scope and authorization

Analysis, explanation, review, diagnosis, and status requests are read-only. They authorize
inspection and evidence collection, not implementation, redesign, deletion, external messages,
commits, pushes, or other state changes. Do not infer authorization from a diagnostic request.

A request to change or build authorizes only the named systems, files, and people in scope. Make the
minimum compatible change, preserve unrelated user changes, and ask when evidence leaves a material
decision unresolved. Do not broaden a local repair into cleanup, migration, refactoring, or external
coordination without explicit scope.

Use this evidence order:

1. Current user request and explicit decisions.
2. Applicable runtime, project, and coding-assistant policies.
3. Verified repository/file evidence.
4. Validated private knowledge.
5. Clearly labelled assumptions, never hidden defaults.

When a required fact is unknown, state the unknown and stop at the clarification or repair boundary.
Never fill it with a plausible default.

## 3. Workspace and instruction precedence

Resolve `<agents-root>` by walking upward from the current project directory and selecting the first
`.agents/` directory; if none exists, use `~/.agents`. `<project-root>` is the parent of
`<agents-root>`.

Instruction inheritance is additive:

- `~/.agents/AGENTS.md` is the parent policy.
- `<project-root>/AGENTS.md` may narrow scope or strengthen requirements but must say that it
  extends the parent; it must not replace or omit it.
- A coding-assistant-specific `AGENTS.md` follows the same additive rule.
- Resolve a project-local skill before the global skill with the same name.

Skill use is mandatory, not discretionary. For every nontrivial request, first inspect the
applicable skill catalogs and invoke every skill whose scope covers part of the request, using the
minimum complete set and the precedence above. When applicability is uncertain, use the closest
matching skill and let its scope/owner boundary reject the route; never silently substitute ad-hoc
work. Do not treat a skill as optional because the task appears small or familiar.

Tool configuration follows the same direction. The project policy `extends` the shared
`<agents-root>/biome.jsonc` configuration and may only strengthen rules or narrow file scope. Bun
has no native `bunfig.toml` inheritance: use the shared `<agents-root>/bunfig.toml` directly,
preferably through a symlink, or pass it explicitly with Bun's `--config`. Duplicating it requires
proof that it is an exact synchronized strengthening.

Do not create `aidx.json` merely to repeat the default `bun run test` gate. Add it only for a
different, explicitly justified project gate. It is compact JSON data with an optional string
`finalGate`; AIDX reads it and never executes it as a program.

## 4. Non-negotiable safety boundaries

### Protected `.agents` configuration

For every resolved `<agents-root>`, including `~/.agents`, these are user-owned configuration and
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

Never edit, create, delete, rename, move, format, autofix, stage, reset, or indirectly mutate these
files. Read-only inspection is allowed. If a requested solution requires one, show the exact
required user action or proposed diff and stop. Automated writes under `<agents-root>` must use an
explicit allowlist that excludes these paths; never run a whole-directory write or autofix.

The assistant may update this `AGENTS.md` only when the user explicitly asks for an instruction or
guardrail change. That exception does not permit changes to the protected configuration files.

### Runtime and reusable-content boundaries

- MCP tools are unavailable in this runtime. Use the approved skills and their caller-facing wrapper
  contracts.
- Reusable guidance uses `<agents-root>`, `<project-root>`, `<repo-search-index>`, and
  source-relative links. Never embed a concrete username, home directory, machine path, or
  credential in shared guidance.
- There is no universal `.agents/references` directory. Never invent or hardcode one.
- Retired workflow references are not executable routing. Use active skills, current references, and
  current command contracts.
- Executable scripts own their implementation by default. Put code in `utils/` only for a genuinely
  shared production boundary with at least two consumers or an explicitly owned reusable boundary
  such as the quality engine. Do not add a global `tools/` directory or a wrapper that only
  relocates one helper.
- During ordinary work, treat `.agents` as read-only except the documented temporary-intent
  namespace and explicitly requested exact runtime-asset work.

## 5. Skill routing quick start

Resolve project-local skills first, then the global fallback, and then an installed runtime/plugin
skill when neither has an owner. For every selected skill, read frontmatter `argument-hint` for the
compact caller/UI shape, then read its complete `## 2. Usage` section and any owner-specific command
or information tables. `argument-hint` is only a hint; the Usage section and owned tables are the
authoritative grammar and may contain alternate routes, optional arguments, or additional
boundaries.

| Skill                        | Quick-start input                                                       | Use when                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/aidp`                      | `<goal-and-concerns>`                                                   | An incomplete or complete request needs evidence intake, clarification, and one explicit six-section execution plan handed to `/aidx`.              |
| `/aidx`                      | `<plan-path-relative-or-absolute>`                                      | One materialized six-section plan needs deterministic execution, delegated ownership, fresh verification, and mapped completion or repair evidence. |
| `/repo-search`               | `<approved-root> <query>`                                               | Repository, symbol, call-path, architecture, or code-text discovery is needed; read Usage for inspection routes and the complete wrapper contract.  |
| `/knowledge-base`            | `<operation> <private-kb-root> <scope-or-request>`                      | A private-KB decision, policy, prior lesson, capture, reconciliation, or OKF validation is needed.                                                  |
| `/biome-tsc-checker`         | `<path> [path...]`                                                      | Explicit JavaScript or TypeScript paths need Biome, strict TypeScript, and declaration-order checks.                                                |
| `/bun-test-generator`        | `<sut-path> <all\|method-list\|method-range>`                           | A selected JavaScript/TypeScript unit needs quality-focused Bun tests or an existing Jest test must be converted.                                   |
| `/frontend-design`           | `<ui-brief> <affected-screens> <design-system> <acceptance-criteria>`   | A user-facing web UI is created, redesigned, or visually refreshed.                                                                                 |
| `/react`                     | `<react-or-react-native-scope> <approved-design> <acceptance-criteria>` | React or React Native implementation is in scope after design/content inputs are approved.                                                          |
| `/playwright-test-generator` | `<criteria> <project-root> <playwright-runner>`                         | Browser flows, responsive layout, or an explicit browser-performance budget need retained project-local regression tests.                           |
| `/content-writer`            | `<objective> <audience> <format> <constraints> <citation-style>`        | Research-backed content must be drafted, refreshed, or validated.                                                                                   |
| `/md-compress`               | `begin\|finalize <absolute-markdown-path>`                              | Durable Markdown needs lossless compression with a verified temporary backup.                                                                       |
| `/skill-manager`             | `<operation> [arguments]`                                               | Any skill needs to be created, updated, reviewed, renamed, synchronized, optimized, validated, or repaired.                                         |

Skill ownership rules:

- `/skill-manager` owns every skill-package lifecycle request, including frontmatter, resources,
  matrices, prose/link review, validation, and closure. Read
  `<agents-root>/skills/skill-manager/SKILL.md` as the owning skill.
- `/repo-search` owns caller-facing repository discovery through its wrapper; do not bypass it with
  an alternate index or backend. Read `<agents-root>/skills/repo-search/SKILL.md` as the owning
  skill.
- `/knowledge-base` alone owns the configured private-KB root and its lifecycle. Read
  `<agents-root>/skills/knowledge-base/SKILL.md` as the owning skill.
- `/bun-test-generator` owns every JavaScript/TypeScript test addition, conversion, repair, rename,
  or deletion before the test is touched.
- `/playwright-test-generator` owns retained browser acceptance coverage and does not replace unit
  coverage or modify global dependencies.

## 6. Evidence, discovery, and context

For every nontrivial workflow, use `/knowledge-base` for durable prior context and lesson capture.
When a fact, policy, or precedent is unknown or ambiguous, invoke `/knowledge-base` immediately;
never guess a path, schema, or behavior. Use `/repo-search` for **all repository/file discovery**:
code, symbols, call paths, architecture, configuration, documentation, and any file literally. This
is mandatory even when the target seems obvious or the request is small. Do not use `find`, `rg`,
`grep`, globbing, directory dumping, or ad-hoc file reading as a substitute. Read only the smallest
targeted fragments returned by the wrapper. The only pre-discovery reads are the explicitly named
policy/skill owner files required to resolve routing and the wrapper contract itself.

Repository evidence establishes what exists and how it flows. Private knowledge supplies business
intent, terminology, ownership, and precedent. Record facts, receipts, evidence limits, conflicts,
and unresolved decisions before asking a question or making a plan.

Batch independent reads and distinct checks when safe, but never run the same checker, command,
query, or final gate concurrently. Reject duplicate normalized queries in every batch API. For AIDX,
use one `advance-batch` request for consecutive prepared non-gated transitions; use an individual
transition when the state contract requires a user gate, test receipt, repair receipt, or other
non-batchable event.

### AIDP and AIDX boundary

Use AIDP for clarification, evidence intake, and one approved six-section plan whose body is exactly
one H1 (the frontmatter `title`) followed by the six H2 sections in order:
`## 1. TARGET DIRECTIVES`, `## 2. VARIABLE DEFINITION MATRIX`, `## 3. CHRONOLOGICAL WORKFLOW`,
`## 4. TOOL STRATEGY & FALLBACKS`, `## 5. SYSTEMATIC VERIFICATION CHECKLIST`, and
`## 6. RIGID OUTPUT SCHEMA`. Use AIDX in fresh context for deterministic construction, delegation,
verification, repair/re-plan behavior, and one final gate. AIDX accepts the absolute or relative
plan path defined by its own Usage contract; do not parse or reinterpret the plan in the caller.

## 7. Coding and test changes

- Make the minimum change satisfying the verified behavior. Reuse existing code, types, patterns,
  configuration, and test helpers before adding an abstraction. Remove code, tests, configuration,
  documentation, or references made dead by the change.
- Do not remove pre-existing dead code on assumption. Report evidence and ask whether to include
  separate cleanup.
- Before changing shared production code, a canonical shared test, or a shared mock registration,
  build a bounded impact map with `/repo-search`: direct importers/callers, public consumers,
  same-process tests, compatibility risks, and focused proof for each risk. If the map cannot be
  established, stop.
- Never add an unbounded top-level `mock.module()` to a shared Bun suite. Bun mocks can persist
  across test files in one process; prove compatibility for every same-process consumer, or use
  test-local injection/an isolated boundary.
- For every JavaScript/TypeScript test change, invoke `/bun-test-generator` first, use the real SUT,
  mock every external boundary, run `validate-boundaries`, and then use `/biome-tsc-checker` on
  selected paths. A passing test, coverage result, or skill validation cannot substitute for the
  required generator receipt. Do not use `mock.restore()` as proof that a shared same-process mock
  is isolated.
- For retained browser acceptance coverage, invoke `/playwright-test-generator` with the selected
  project's local runner.

Use a failure-first repair loop for multi-lane work: run one baseline discovery or validation pass,
collect independent failures, apply compatible repairs as one batch, run focused checks, and run the
final gate once. Keep a concise command/result/next-action ledger. Never rerun an unchanged full
gate after each individual fix.

Final-gate action packets are executable repair instructions. When a checker returns a non-blocked
packet with explicit `allowedPaths`, required actions, and forbidden actions, the owning workflow
must immediately apply that packet through the owner's explicit apply route, verify the allowed
target, and rerun the same gate. Never merely display, summarize, or hand off a safe packet. A
missing, blocked, ambiguous, or unsafe packet is a hard stop; do not invent a repair or cross its
boundaries.

### Line length

Wrap Markdown and MDX prose at 100 characters or fewer. TypeScript and JSON already use the shared
Biome `lineWidth` of 100, so no separate rule is needed there. Tables, fenced code blocks, YAML
frontmatter, headings, `import`/`export` lines, recitation and verse blockquotes, single unbreakable
tokens (a long URL or code span), and `<em>Source: ...</em>` citation lines are exempt because
wrapping them would break their meaning or the rendered structure.

100 is a band, not a ceiling you approach from below: a compliant wrapped line runs past 80
characters. Refill prose a file already wraps narrower, and never treat the width you find in a file
as the rule. A document wrapped at 78 or 80 is non-compliant, not a precedent, and `<= 80` is not
`<= 100` - widen it into the 81-100 band. The number is 100 whatever that file currently does.

A repository can be owner-frozen against band refill: its committed below-band wrap stays frozen, so
the reflow transform runs there in its default over-limit mode only and that corpus must stay
byte-identical; never point `--band` at an owner-frozen repository.

Keep these units atomic when wrapping; splitting any of them changes meaning or breaks the build:

- an inline code span, a link's text or its target, an MDX `{...}` expression, and a JSX tag with
  its attributes.
- a heading, and any line the renderer treats as one structural unit.
- an `<em>...</em>` element: breaking inside it fails the build with `Expected a closing tag for
  <em>`.

Never let a wrapped continuation line begin with structure: an ordered-list marker (`N.` or `N)`),
`>`, `#`, `[`, `{`, or a JSX tag. A continuation line starting with `N.` silently becomes a new
ordered-list item, and one starting with a tag turns an inline element into a flow element. A bare
`[` is a reference-definition hazard, but a complete inline link `[text](target)` is exempt: its
label is followed by a target, never `:`, so it cannot parse as a reference or footnote definition
and may lead a continuation line. When an inline JSX element must begin a continuation line, keep
the preceding space with `&nbsp;` so the rendered text does not lose it.

Citation, footnote, and source blocks carry their own alignment. A footnote definition's
continuation lines are indented to align under the label text, so a wider `[^N]:` marker shifts
every continuation line right by the same number of characters; each language or reference chunk
keeps its own line. Preserve that indentation and those breaks exactly - joining or re-indenting
them breaks rendering and the source line alike.

### Mechanical rewrites and formatting transforms

When one rule applies across many files, whether it is a line width, a formatting convention, or a
token substitution, do not hand-edit the files. Write one deterministic transform, dry-run it to
classify every affected line, inspect each class, then drive every selected file through that one
transform. Hand-editing is what produces the inconsistency a rule-based rewrite exists to remove.
Revert the whole batch when an invariant fails instead of patching individual files.

Keep the transform and its verification scripts outside the repository. A scratch directory or
helper script left in the tree becomes a lint or build failure and a commit hazard; use the
temporary-path rule above and retire it when the work closes.

A formatting-only change still needs proof that only formatting changed. Verify in this order:

1. Normalize whitespace and compare the text: the sequence of non-whitespace characters must be
   identical per file.
2. Compare the target set (link targets, URLs, code spans, citation targets) against the committed
   version, not just its count. Equal counts hide a silently rewritten target.
3. Parse both versions with the document's real parser and compare the syntax tree, so a structural
   change cannot hide behind identical text.
4. Run the project's build and lint gates.
5. Spot-check rendered output for the structural facts the parser cannot see.

Report residual exceptions as counted classes with the reason each is irreducibly exempt, and prove
the negative: state how many remaining lines were wrappable, so "every line complies" is a measured
claim rather than an impression.

## 8. Command, script, and structured-data contracts

Before invoking any script or skill command, read its owning command catalog and parser/entrypoint.
Bundled `scripts/` own repeated or fragile operations; inspect `--help` only when the owning skill
does not already provide the contract. Verify exact arity, positional meanings, transport type
(path, inline string, or temporary request file), and JSON schema. Validate the request with the
owner parser before any side effect. A rejected invocation is a command-contract defect to repair,
not evidence and not a reason to repeat the same malformed command.

Every bundled script accepts exactly one `--help` or `-h` argument as a side-effect-free metadata
route. It prints that script's usage contract to stdout, exits successfully, and performs no file,
process, network, or stdin work. Treat this universal option as part of every script's input/output
contract; owner tables need not repeat it in every row.

### File retirement (deletion is prohibited)

Never delete a file with `rm`, `unlink`, `fs.rm`, `rmSync`, `fs.unlinkSync`, or any deletion API or
shell command. Deletion is permanently prohibited regardless of whether the file is temporary, a
backup, a stale artifact, or production content. Permission rules deny `rm`; do not attempt it, do
not ask for it, and do not report it as a blocker.

The only sanctioned retirement path is **move to trash**:

```text
mv <absolute-source-path> <trash-destination>
```

where `<trash-destination>` is `~/.Trash/<basename>` or, on collision,
`~/.Trash/<basename>.<suffix>`. Use the `trash.ts` module's `defaultMoveSourceToTrash` for
programmatic retirement; use `mv` directly for shell-level retirement. Never skip this rule for
"trivial" temp files - the OS tmpdir janitor handles those, and any other file must be trashed, not
deleted.

### String-only JSON boundary

When a tool or script accepts a string containing JSON, pass a string, never an object. The built-in
write tool schema-rejects `{`-prefixed string content with `Expected string, got {...}` at
`["content"]` because the tool re-types JSON-shaped strings as objects during argument validation.
Never reuse the editor for JSON payloads; always use the shared TypeScript writer.

For backtick-, dollar-, quote-, or newline-rich JSON that must be written to disk, there is exactly
ONE way: the four-step procedure below. There is no alternative, no exception, no shortcut, and no
fallback. Do not attempt any other method - not the editor `write` tool, not `JSON.stringify`, not a
heredoc, not Python, not `echo`, not shell redirection, and not any ad-hoc workaround. If you cannot
complete all four steps, STOP and tell the user what you cannot do; do not substitute a different
method.

1. **Obtain the output path.** Run standalone `mktemp` alone and retain the absolute path it prints.
   The writer rejects any output path outside `os.tmpdir()` and refuses relative or guessed paths.
   Never guess `/tmp` or `/private/tmp`; always use the exact path `mktemp` prints.
2. **Build the JSON string in memory.** JSON is whitespace-insensitive; keep newlines inside string
   bodies as literal `\n` escapes. Encode Markdown backticks as `\u0060` and dollar signs as
   `\u0024` if they appear inside string bodies.
3. **Write the source file.** There are two methods, in priority order:

   **Method A (preferred): TypeScript builder.** Write a small `.ts` file to `os.tmpdir()` using the
   editor `write` tool (the content is TypeScript source, not JSON, so the schema accepts it). The
   script builds the JSON object in memory and calls `console.log(JSON.stringify(obj))`. Run it with
   `bun` and redirect stdout to the source file. This avoids all shell interpretation issues:

   ```text
   bun <absolute-builder-script-path> > <absolute-request-source-path>
   ```

   **Method B (fallback): printf for short JSON.** Only for JSON under 200 bytes with no special
   characters. Pipe the literal string to a temp file with
   `printf '%s' '<json-string>' > <absolute-request-source-path>`. Single-quoted printf avoids shell
   variable, heredoc, command substitution, and backtick interpretation. **If printf fails or the
   JSON is long, use Method A.**

4. **Materialize then invoke the owner.** Run the writer pipe:

   ```text
   cat <absolute-request-source-path> | bun <agents-root>/scripts/write-json.ts <absolute-json-output-path>
   ```

   The writer reads stdin, validates JSON, pretty-prints it, and writes only inside the OS temp
   directory. After materialization succeeds, invoke the owning command separately with the same
   literal output path. For the knowledge-base skill, that command is:

   ```text
   bun <agents-root>/scripts/knowledge-base.ts reconcile <private-kb-root> <absolute-json-output-path>
   ```

Forbidden for every KB reconciliation, AIDP capture, or other fixed JSON boundary: heredoc, shell
redirection other than the writer pipe, shell variables, command substitution, inline writers,
Python, object-valued tool calls, `JSON.stringify(request)` as a fallback, guessed temp paths such
as `/tmp` or `/private/tmp`, and the built-in write tool for JSON payloads. If you already used one
of these forbidden methods, that output is INVALID; discard it and redo from step 1.

The writer entrypoint remains `write-json.ts`; the owning skill determines the `request` schema and
lifecycle, and the `request` itself follows that owner's contract.

### Temporary paths

Every temporary path must be printed by standalone `mktemp` or derived from `os.tmpdir()` evidence.
Never guess a platform temp path, reuse a placeholder, or create multiple temp directories for one
workflow when one OS temp directory with distinct files is sufficient. Standalone `mktemp` prints a
regular file path; when a workflow needs a directory to hold a builder script and its output, run
`mktemp -d` and use the directory it prints. Creating files under a plain `mktemp` path fails
because that path is a file, not a directory.

### Model error recovery

When the model API returns "Not Found" with `isRetryable: false` and `nvcf-status: errored`, display
the following fenced recovery prompt to the user instead of the raw error message:

```
Continue from where you left off.
```

The session state is persisted, so no work is lost. If the model is consistently down, suggest
switching to a different provider/model.

### Tool-call and sandbox discipline

- Every tool call must carry a non-empty `description` per its schema; omission is a contract
  violation. On a schema rejection, re-read the tool schema once, then retry with the corrected
  shape - never resubmit the same malformed call.
- Sandbox denial (`EPERM`, `file access denied`, or a `sandbox: denied` marker): retry the exact
  same operation once with `sandbox_permissions` set to the narrowest wider mode plus a one-sentence
  justification; the approval prompt is the consent mechanism. Never detour through chat to ask
  first, never work around a denial with a different method, and treat a rejected escalation as
  final for that operation.
- Writing Markdown or source content containing backticks, dollar signs, or mixed quotes through
  `run_code` + `tools.write`: never wrap the payload in a JS template literal (backtick
  interpolation corrupts fenced code and breaks the harness parse). Build the content as an array of
  plain single-quoted strings joined with `'\n'`. The owned lesson is the private-KB entry
  `agent-infrastructure/ptc-mode-file-writing-with-run-code-and-write.md`.

## 9. Validation, gates, and closeout

After the complete implementation batch:

1. Run the focused checks for changed behavior and affected boundaries.
2. Run the hidden-character sanitizer over every changed file, then over the workspace, before the
   final gate:

   ```text
   bun <agents-root>/scripts/sanitize-hidden.ts .
   ```

   This strips zero-width and soft-hyphen characters, BOM, non-breaking and weird dashes to ASCII
   "-", and stale control bytes from every text file under the working tree (recursively, in
   parallel, skipping `.git`, `build`, `coverage`, `node_modules`, `playwright`, `*.html`, and
   binary extensions). The command above is a dry-run preview and never modifies files; files change
   only with the explicit `--write` flag. Review the preview, then apply it once, immediately before
   the final gate:

   ```text
   bun <agents-root>/scripts/sanitize-hidden.ts . --write
   ```

   NEVER pass `--write` without having just reviewed a dry-run of the exact same scope: the write
   pass rewrites files in place and cannot be undone. Binary content is detected from the bytes (a
   NUL byte or invalid UTF-8) and skipped, so images, fonts, and archives are never rewritten.
   Re-diff after the run so any sanitized line is part of the same closeout batch.

3. Run the selected project final gate exactly once.
4. If it fails, collect all compatible repairs, apply them as one repair batch, and run the same
   final gate exactly once again.

The final gate is the project-approved `finalGate` in `aidx.json`, otherwise `.agents`'s
`bun run test`, otherwise `bun run test`. All required checks in the selected gate must pass; a
matrix score, unit subset, coverage result, intention, or partial green receipt never closes the
work.

Closeout reports exact changed files, commands and results, validation/resource/ link findings,
owner receipts, limitations, and remaining follow-up. Preserve a resumable record when work spans
turns. Capture durable lessons only when they are specific, verified, and owned by the knowledge
base.

## Appendix A: repo-search command catalog

The caller-facing wrapper is:

```bash
bun <agents-root>/scripts/repo-search.ts "<approved-root>" "<query>"
bun <agents-root>/scripts/repo-search.ts inspect "<approved-root>" "<absolute-jsonl-request-path-under-os-tempdir>"
```

| Command or information | Arguments                                                                                                                                                               | When to use                                                         | Additional information                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `list-projects`        | `-`                                                                                                                                                                     | Resolve approved roots and matching indexes                         | Select by explicit indexed root.                                                                           |
| `index-status`         | `<repo-search-index>`                                                                                                                                                   | Check readiness before a read                                       | Follow the indexing boundary and receipt if not ready.                                                     |
| `architecture`         | `<repo-search-index>`                                                                                                                                                   | Read indexed architecture                                           | Returns one wrapper-owned result.                                                                          |
| `schema`               | `<repo-search-index>`                                                                                                                                                   | Verify graph identity fields                                        | Use before relying on a newly observed identity field.                                                     |
| `snippet`              | `<repo-search-index>` `<qualified-name>`                                                                                                                                | Read one indexed code snippet                                       | Request the smallest fragment needed.                                                                      |
| `search-graph`         | `<repo-search-index>` `<query>` `<positive-limit>`                                                                                                                      | Search graph nodes                                                  | A match requires normalized identity-field evidence.                                                       |
| `search-code`          | `<repo-search-index>` `<literal-pattern>` `<positive-limit>`                                                                                                            | Search indexed code text                                            | Use after graph search or as a declared inspection operation.                                              |
| `query`                | `<repo-search-index>` `<graph-query>` `<positive-limit>`                                                                                                                | Run a bounded graph query                                           | Keep the query narrow and record the receipt.                                                              |
| `trace`                | `<repo-search-index>` `<qualified-name>` `<inbound\|outbound>` `<positive-depth>`                                                                                       | Trace callers or callees                                            | Direction is restricted to `inbound` or `outbound`.                                                        |
| `discover`             | `<approved-root>` `[repo-search-index]` `<query>`                                                                                                                       | Any code, symbol, call-path, architecture, or literal-text question | Path-only works without an index; indexed form tries graph/code search, then returns one fallback receipt. |
| `inspect`              | `<approved-root>` `<absolute-jsonl-request-path-under-os-tempdir>`                                                                                                      | Several independent reads for one decision                          | Returns one resolved index, readiness result, and ordered receipt per read.                                |
| `inspection JSONL`     | `architecture(path)`, `schema`, `search-graph(namePattern,label,limit)`, `snippet(qualifiedName)`, `trace(qualifiedName,direction,depth)`, `search-code(pattern,limit)` | Batch independent reads                                             | The request file must be under the operating-system temp directory.                                        |

Inspection JSONL operations:

```jsonl
{"operation":"architecture","path":"<directory-prefix>"}
{"operation":"schema"}
{"operation":"search-graph","namePattern":"<regular-expression>","label":"<graph-label>","limit":<positive-integer>}
{"operation":"snippet","qualifiedName":"<qualified-name>"}
{"operation":"trace","qualifiedName":"<qualified-name>","direction":"<inbound-or-outbound>","depth":<positive-integer>}
{"operation":"search-code","pattern":"<literal-pattern>","limit":<positive-integer>}
```

`OKF` means Open Knowledge Format: the Markdown/frontmatter representation and indexing convention
used by the private KB. It describes how knowledge is represented, not what the knowledge is about.
The private-KB root is independent of `<agents-root>` and cannot be selected or overridden by a
project runtime.
