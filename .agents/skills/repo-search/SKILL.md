---
name: repo-search
description: >
  Deterministic repository and file discovery engine for codebases.
  Executes strategy-first planning to map target boundaries before
  filesystem reads. Primary discovery utilizes an installed repo-search
  CLI wrapper contract for structural analysis of code, Markdown, 
  configurations, and symbols. If CLI search fails, the system triggers
  a staged textual fallback degrading sequentially to AST parsing, regex,
  and literal text matching. Provides strict evidence tracing by logging
  exact byte offsets, line numbers, call paths, and confidence scores.
  Outputs a structured discovery report mapping system architecture.
argument-hint: "<approved-root> <query> [query...]"
capabilities:
  - CLI-driven symbol, call path, and architecture mapping
  - Multi-stage fallback (CLI -> AST -> Regex -> Literal)
  - Strict evidence tracing with byte-offset verification
  - Unified JSON discovery reporting for automated ingestion
---

# Repo Search

Use this skill for approved repository, home, or private-KB code-graph
discovery when exact paths, symbols, callers, callees, configuration,
structural causes, architecture, or evidence-backed file-text findings must be
established. repo-search owns the complete repository-search discovery
workflow, command grammar, wrapper implementation, receipts, and report. The
installed repo-search CLI backend is invoked only through this owned wrapper.
`/knowledge-base` owns durable private-KB records; repo-search owns the
code-graph discovery contract over an approved private-KB root.
`/skill-manager` owns this package's lifecycle.

## 1. Role & Scope

- **Role:** Deterministic repository code-discovery engine and complete
  repository-search wrapper.
- **Objective:** Return a structurally traced, evidence-backed answer to a
  repository question without guessing paths, symbols, causes, or completion.
- **Trigger:** Mandatory caller-facing route for every repository/file
  discovery request: code, symbols, configuration, documentation, architecture,
  call paths, or any file literally. Use it even when the path or filename
  appears obvious; callers must not decide to skip it.
- **Boundary:** This skill discovers and analyzes approved repository, home,
  or private-KB code-graph evidence. It does not edit source files or own
  durable private-KB records. Route implementation to the appropriate owner
  and route durable private knowledge to `/knowledge-base`.

### Complete repository-search ownership

Repo-search owns the complete repository-search contract: approved-root
selection may target an approved repository, home, or private-KB root, while
the approved-root boundary remains explicit and never inferred.
selection, matching returned project-index validation, wrapper command grammar,
repo-search CLI execution, inspection JSONL parsing, machine-readable receipts,
readiness and indexing boundaries, one requested-read retry after indexing,
deterministic fallback interpretation, identity-field graph matching, and
snapshot limitations. Callers use this skill and its implementation for all
repository discovery.

## 2. Usage

```text
/repo-search <approved-root> <query> [query...] # discover one or more independent queries through the owned wrapper
/repo-search inspect <approved-root> <absolute-jsonl-request-path> # inspect one bounded search request
```

The unannotated grammar is:

```text
/repo-search <approved-root> <query> [query...]
/repo-search inspect <approved-root> <absolute-jsonl-request-path>
```

Required: approved root and query for discovery, or an approved root and
temporary JSONL request path for bounded inspection. Use the wrapper contract;
do not invoke the backend directly.

## 3. Immutable Operational Rules

- **Strategy before search:** Before any repository search, form a compact
  search plan covering the relevant subsystem, exact symbols or configuration
  keys, structural anchors, and why each target matters. Keep the plan concise;
  do not emit a ceremonial strategy block.
- **Primary route:** After the strategy block, invoke the
  installed repo-search CLI backend through the repo-search-owned command contract as
  the primary search path. Evaluate whether returned evidence is semantically
  sufficient: it must cover the requested symbols or structure and the core
  file matrix needed for the answer. Do not use MCP tools, invent a second
  router, invoke the underlying engine directly, or bypass this skill. Never
  invoke the underlying engine directly. The command contract requires that
  callers do not use MCP tools as a substitute for the owned CLI.
- **Mandatory route:** Once applicable policies and the owner skill contract
  are read, all repository/file discovery goes through this skill. Do not use
  `find`, `rg`, `grep`, shell globs, directory dumps, or direct ad-hoc reads as
  a caller-side substitute. This includes locating a single named file. Read
  only the smallest targeted fragments returned by the wrapper; direct reads
  are reserved for the explicitly named policy/skill owner files needed to
  resolve routing and this wrapper contract.
- **Wrapper boundary:** Use only the shared repo-search wrapper, an approved
  root, the matching returned project index, documented flags, and the wrapper's
  request transport. Commands take exact flags, not inline JSON payloads. Do
  not run `rg` manually or invoke a backend directly.
- **Project identity:** Resolve the intended root from the project list. A
  shared parent directory does not combine separate repositories; choose by
  intended root and returned project name, not path ancestry.
- **Receipt discipline:** Interpret every machine receipt before choosing a
  next action. Do not repeat a listed attempt, run an unowned fallback, or
  treat fuzzy graph ranking, readiness, or a stale snapshot as proof.
- **Graph match:** A graph result counts only when the normalized query occurs
  in the identity fields `name`, `qualified_name`, `file_path`, or `path`.
  Descriptions, ranking text, serialized metadata, and unrelated fields are
  not identity evidence. If a schema adds an identity field, verify it through
  a live schema/result and add a regression test before relying on it.
- **Indexing:** Index only when no matching project index exists. If readiness
  remains unavailable, report the exact output and stop; do not invent an
  index or broaden the approved root.
- **Bounded fallback:** If primary evidence is zero-hit, partial, or missing
  the core file matrix, retain the primary query and receipt, then run the
  fallback stages in order: targeted symbol-definition search, proximity
  search around structural anchors or configuration, and broad semantic-token
  search constrained to the target subsystem. Do not broaden scope without a
  retrieved anchor.
- **Evidence discipline:** Every accepted claim must point to retrieved file
  evidence. Keep observed facts separate from inference, rank relevance, state
  uncertainty, compare working repository patterns, and verify one hypothesis
  at a time. Never guess paths, symbols, causes, or completion; the explicit
  boundary is never guess paths, never guess symbols, never guess causes, and
  never guess completion. Evidence discipline means never guess.
- **Refinement and stop:** If the trace reaches a dead end, record what was
  tested, refine the strategy, and re-search using the next justified
  hypothesis. Record a replan when evidence contradicts the boundary. If the
  query is structurally answered, stop with the evidence map; if bounded search
  is exhausted, stop with explicit exhaustion and unresolved uncertainty.

### Deterministic fallback interpretation

The wrapper's ordered search path is repo-search graph, repo-search code search, exact literal
content, case-insensitive literal content, then filename discovery. The receipt
states every executed or skipped attempt. `source: "repo-search"` is authoritative for
the requested query; `source: "rg"` means the wrapper selected its ordered
fallback; `source: "none"` is not-found. A fallback is expected deterministic
behavior, not permission for a caller to repeat or bypass it. This is the
shared fallback command; it stops at the first **exact literal** match, and the
caller must **never repeat a listed** attempt.

The source receipt token is also preserved exactly as `source:
"repo-search"`.

The wrapper indexes only when no matching project index exists, re-checks
status, and retries the requested read once after a successful index. A ready
index proves engine readiness, not that current uncommitted content equals the
indexed snapshot. The receipt explicitly says `re-check status` and `retry the
requested read once` when indexing was necessary.

## 4. Input & Context Schema

- **Required:** A search question as a string and one approved absolute root.
  A matching `<repo-search-index>` is optional: provide it when indexed graph
  or code search is available, but path-only discovery serves arbitrary
  repositories, home directories, private-KB roots, and ordinary directories
  through the owned deterministic fallback. For several independent indexed
  reads, use one validated inspection request file under the operating-system
  temporary directory.
- **Optional:** Known subsystem boundaries, neighboring working examples,
  likely callers or callees, prior search receipts, or a bounded batch of
  distinct independent reads for one decision. Duplicate normalized queries
  are rejected. Use hypotheses as hypotheses until verified in retrieved files.
- **Context:** Applicable project instructions, the repo-search wrapper command
  contract, project list, index readiness, approved-root boundary,
  strategy block, primary-search receipt, fallback receipts, matched identity
  evidence, inspection fragments, and snapshot freshness limitation.
- **Unknowns:** Missing root or index, unavailable command contract, not-ready
  index, no identity match, broad semantically irrelevant result, missing core
  file matrix, or an index that may not include uncommitted changes remains an
  explicit limitation. Stop or issue one narrower query only when the receipt
  shows the current evidence is insufficient.

## 5. Ordered Execution Chain

```text
request -> strategy -> project/index resolution -> owned CLI read
        -> receipt interpretation -> bounded fallback or evidence report
```

1. **Intake:** Confirm the approved absolute root and question, then state the
   Component Map, Symbol Inventory, and Heuristic Targets. Resolve a matching
   project index only when one is supplied or needed for indexed reads.
2. **Read:** Use one narrow `discover` request for a single question or one
   `inspect` request for several independent indexed reads, or pass several
   independent path-only queries after one approved root. The wrapper resolves
   the index once and runs the path-only queries concurrently, returning one
   receipt per query in input order. The wrapper performs graph-first
   discovery and its validated fallback in the owned order.
3. **Primary search:** Invoke the installed repo-search CLI backend first. Record the
   exact query, returned files/symbols, line ranges, search mode, and complete
   machine-readable JSON receipts. Decide whether the result is semantically
   sufficient for the core matrix.
4. **Inspection and readiness:** A single readiness check precedes declared
   inspection reads. If the index is unavailable, return the status receipt
   without reading further. When indexing is required by the wrapper, it must
   re-check status and retry the requested read once; callers never repeat a
   listed attempt.
5. **Fallback branching:** When primary evidence is zero-hit, partial, or
   core-matrix-missing, execute targeted symbol-definition search, proximity
   search, and broad subsystem-scoped semantic-token search in that order.
   Preserve each query and stop a stage when its evidence is sufficient.
6. **Evidence analysis:** Trace input parameters through discovered processing
   and call path to outputs and references. Verify callers and callees,
   compare working repository patterns, identify structural divergence, rank
   relevance, and label fact versus inference and uncertainty.
7. **Refinement and verification:** If evidence is insufficient, test one
   hypothesis at a time and return to the strategy with the smallest justified
   refinement. Verify every claimed filename and line reference against a
   retrieved fragment. Finish only when structurally answered or explicitly
   exhausted.
8. **Stop or hand off:** Report the evidence-backed discovery to the user.
   Hand implementation or skill-package changes to their named owner. Stop
   and request direction when the boundary, backend, evidence, or acceptance
   condition changes.

### Wrapper command catalog

The complete repository-search command grammar is owned by repo-search. The wrapper
implementation is also repo-search-owned. Commands take exact flags, not
inline JSON payloads; temporary request paths come from standalone `mktemp` or
`os.tmpdir()` evidence.

```bash
bun <agents-root>/scripts/repo-search.ts "<approved-root>" "<query>" ["<query>" ...]
bun <agents-root>/scripts/repo-search.ts inspect "<approved-root>" "<absolute-jsonl-request-path-under-os-tempdir>"
```

The path-only form is the universal route. It supports one query or a bounded
batch of independent queries after one approved root; use the batch form when
several searches are needed for the same decision. It resolves the index once,
runs the queries concurrently, and returns one receipt per query in input order.
It supports path-only discovery without an index and does not expose or require
a project list or index. Its fallback is hidden-file-aware and preserves
dot-directories while excluding only the declared ignored trees. The wrapper
resolves a matching index
internally, attempts indexed graph/code search when available, and uses the
same hidden-file-aware fallback when the index or backend is unavailable. The
`discover` spelling remains a compatibility alias; callers should use the
path-only form. `inspect` and the other diagnostic commands remain internal
indexed operations.

| Command or information | Arguments | When to use | Additional information |
| --- | --- | --- | --- |
| `list-projects` | `-` | Resolve approved roots and matching indexes | Returns the project list; select by explicit indexed root. |
| `index-status` | `<repo-search-index>` | Check readiness before a read | If not ready, follow the repo-search indexing boundary and receipt. |
| `architecture` | `<repo-search-index>` | Read indexed architecture | Returns one wrapper-owned architecture result. |
| `schema` | `<repo-search-index>` | Verify graph identity fields | Use before relying on a newly observed identity field. |
| `snippet` | `<repo-search-index>` `<qualified-name>` | Read one indexed code snippet | Use the smallest returned fragment needed for the decision. |
| `search-graph` | `<repo-search-index>` `<query>` `<positive-limit>` | Search graph nodes | A match requires normalized identity-field evidence. |
| `search-code` | `<repo-search-index>` `<literal-pattern>` `<positive-limit>` | Search indexed code text | Use after graph search or as a declared inspection operation. |
| `query` | `<repo-search-index>` `<graph-query>` `<positive-limit>` | Run a bounded graph query | Keep the query narrow and record the receipt. |
| `trace` | `<repo-search-index>` `<qualified-name>` `<inbound\|outbound>` `<positive-depth>` | Trace callers or callees | Direction is restricted to `inbound` or `outbound`. |
| `discover` | `<approved-root>` `<query>` | Compatibility alias for any code, symbol, call-path, architecture, or literal-text question | The wrapper resolves the index internally, tries graph/code search first, then returns one ordered fallback receipt. |
| `inspect` | `<approved-root>` `<absolute-jsonl-request-path-under-os-tempdir>` | Several independent reads for one decision | Returns one resolved index, readiness result, and one ordered receipt per read. |

Inspection JSONL accepts only these operations:

```jsonl
{"operation":"architecture","path":"<directory-prefix>"}
{"operation":"schema"}
{"operation":"search-graph","namePattern":"<regular-expression>","label":"<graph-label>","limit":<positive-integer>}
{"operation":"snippet","qualifiedName":"<qualified-name>"}
{"operation":"trace","qualifiedName":"<qualified-name>","direction":"<inbound-or-outbound>","depth":<positive-integer>}
{"operation":"search-code","pattern":"<literal-pattern>","limit":<positive-integer>}
```

Use the smallest returned snippet needed for the decision; do not dump whole
source trees. The query-aware graph match requires the normalized query in
`name`, `qualified_name`, `file_path`, or `path`. A fallback is expected
behavior, not permission to repeat or bypass the wrapper.

## 6. Output & Completion Contract

- **Success:** Return a concise result with these four fields:

  ```text
  Finding: [Evidence-backed answer]
  Evidence: [Exact filenames, line references, and relevant receipts]
  Search status: [SUCCESS / FALLBACK_TRIGGERED / EXHAUSTED]
  Uncertainty: [Remaining limitation, or none]
  ```

  Include exact filenames and line references, the primary status, every
  fallback action or an explicit no-fallback reason, relevant data flow,
  structural divergence when applicable, and either refinement evidence or
  bounded exhaustion. Keep machine-readable receipts available internally
  without expanding the user-facing format.

- **Proof:** The compact search plan, primary or fallback search receipts,
  retrieved fragments, input-to-processing-to-output trace, reference checks,
  divergence comparison, identity evidence, snapshot limitation, and
  line-reference audit establish the result. A plausible explanation without
  those receipts is not completion.
- **Failure:** State the exact stage, query, missing evidence, tested
  hypothesis, and unresolved uncertainty. Return to strategy refinement when a
  dead end is reached; hand an implementation request to its owner; never
  claim a root cause or completion from a partial search.

## 7. Evaluation Anchors

- **Canonical:** A narrow query returns a repo-search-owned repo-search-first receipt
  and an evidence-backed file/symbol finding; a discovery request starts with
  Component Map, Symbol Inventory, and Heuristic Targets.
- **Boundary:** A fuzzy result, stale snapshot, missing index, semantically
  irrelevant match, guessed path, direct backend invocation, MCP substitution,
  or missing evidence is treated as uncertainty or a stop rather than proof.
- **Challenge:** When no matching index exists, the wrapper indexes only then,
  **re-checks status**, and **retries the requested read once**; callers do not
  bypass the wrapper or repeat its attempts. A zero-hit primary search triggers
  definition, proximity, and broad semantic fallback in order.
- **Independent verifier:** Wrapper receipts, identity-field matching,
  inspection validation, search-plan coverage, fallback predicates and order,
  compact report fields, line-reference checks, and the `/skill-manager`
  frozen matrix independently verify the result.
