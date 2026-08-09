---
name: repo-search
description: "Deterministic repository code discovery with a complete repository-search wrapper contract, strategy-first planning, installed CBM CLI search, staged textual fallback, evidence tracing, and structured discovery reporting."
---

# Repo Search

Use this skill for approved repository, home, or private-KB code-graph
discovery when exact paths, symbols, callers, callees, configuration,
structural causes, architecture, or evidence-backed file-text findings must be
established. repo-search owns the complete repository-search discovery
workflow, command grammar, wrapper implementation, receipts, and report. The
installed CBM CLI backend is invoked only through this owned wrapper.
`/knowledge-base` owns durable private-KB records; repo-search owns the
code-graph discovery contract over an approved private-KB root.
`/skill-manager` owns this package's lifecycle.

## 1. Role & Scope

- **Role:** Deterministic repository code-discovery engine and complete
  repository-search wrapper.
- **Objective:** Return a structurally traced, evidence-backed answer to a
  repository question without guessing paths, symbols, causes, or completion.
- **Trigger:** Use when a request asks where code lives, how a symbol or
  configuration flows, why an implementation behaves a certain way, which
  repository structures support a claim, or which callers/callees form a path.
- **Boundary:** This skill discovers and analyzes approved repository, home,
  or private-KB code-graph evidence. It does not edit source files or own
  durable private-KB records. Route implementation to the appropriate owner
  and route durable private knowledge to `/knowledge-base`.

### Complete repository-search ownership

Repo-search owns the complete repository-search contract: approved-root
selection, matching returned project-index validation, wrapper command grammar,
CBM CLI execution, inspection JSONL parsing, machine-readable receipts,
readiness and indexing boundaries, one requested-read retry after indexing,
deterministic fallback interpretation, identity-field graph matching, and
snapshot limitations. Callers use this skill and its implementation for all
repository discovery.

## 2. Immutable Operational Rules

- **Strategy before search:** Before any repository search, emit a strategy
  block with a Component Map, Symbol Inventory, and Heuristic Targets. Name the
  subsystem, exact symbols or configuration keys, expected structural anchors,
  and the reason each target is relevant. The strategy is mandatory before any
  repository search.
- **Primary route:** After the strategy block, invoke the
  installed CBM CLI backend through the repo-search-owned command contract as
  the primary search path. Evaluate whether returned evidence is semantically
  sufficient: it must cover the requested symbols or structure and the core
  file matrix needed for the answer. Do not use MCP tools, invent a second
  router, invoke the underlying engine directly, or bypass this skill. Never
  invoke the underlying engine directly. The command contract requires that
  callers do not use MCP tools as a substitute for the owned CLI.
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

The wrapper's ordered search path is CBM graph, CBM code search, exact literal
content, case-insensitive literal content, then filename discovery. The receipt
states every executed or skipped attempt. `source: "cbm"` is authoritative for
the requested query; `source: "rg"` means the wrapper selected its ordered
fallback; `source: "none"` is not-found. A fallback is expected deterministic
behavior, not permission for a caller to repeat or bypass it. This is the
shared fallback command; it stops at the first **exact literal** match, and the
caller must **never repeat a listed** attempt.

The source receipt token is also preserved exactly as `source:
"cbm"`.

The wrapper indexes only when no matching project index exists, re-checks
status, and retries the requested read once after a successful index. A ready
index proves engine readiness, not that current uncommitted content equals the
indexed snapshot. The receipt explicitly says `re-check status` and `retry the
requested read once` when indexing was necessary.

## 3. Input & Context Schema

- **Required:** A code-graph question as a string; one approved repository,
  home, or private-KB root; its matching returned `<cbm-index>`; and, when
  supplied, exact symbols, paths, configuration keys, or user-reported behavior
  to investigate. For several independent reads, use one validated inspection
  request file under the operating-system temporary directory.
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

## 4. Ordered Execution Chain

1. **Intake:** Resolve the approved root and matching returned project index
   from the project list, confirm the question and boundary, and state the
   Component Map, Symbol Inventory, and Heuristic Targets. Before any CBM
   command, read the applicable `tool-execution.md` when it exists.
2. **Read:** Use one narrow `discover` request for a single question or one
   `inspect` request for several independent reads. The wrapper performs
   graph-first discovery and its validated fallback in the owned order.
3. **Primary search:** Invoke the installed CBM CLI backend first. Record the
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
bun <agents-root>/scripts/repo-search.ts discover "<approved-root>" "<cbm-index>" "<query>"
bun <agents-root>/scripts/repo-search.ts inspect "<approved-root>" "<absolute-jsonl-request-path-under-os-tempdir>"
```

| Command or information | Arguments | When to use | Additional information |
| --- | --- | --- | --- |
| `list-projects` | `—` | Resolve approved roots and matching indexes | Returns the project list; select by explicit indexed root. |
| `index-status` | `<cbm-index>` | Check readiness before a read | If not ready, follow the repo-search indexing boundary and receipt. |
| `architecture` | `<cbm-index>` | Read indexed architecture | Returns one wrapper-owned architecture result. |
| `schema` | `<cbm-index>` | Verify graph identity fields | Use before relying on a newly observed identity field. |
| `snippet` | `<cbm-index>` `<qualified-name>` | Read one indexed code snippet | Use the smallest returned fragment needed for the decision. |
| `search-graph` | `<cbm-index>` `<query>` `<positive-limit>` | Search graph nodes | A match requires normalized identity-field evidence. |
| `search-code` | `<cbm-index>` `<literal-pattern>` `<positive-limit>` | Search indexed code text | Use after graph search or as a declared inspection operation. |
| `query` | `<cbm-index>` `<graph-query>` `<positive-limit>` | Run a bounded graph query | Keep the query narrow and record the receipt. |
| `trace` | `<cbm-index>` `<qualified-name>` `<inbound\|outbound>` `<positive-depth>` | Trace callers or callees | Direction is restricted to `inbound` or `outbound`. |
| `discover` | `<approved-root>` `<cbm-index>` `<query>` | One code, symbol, call-path, architecture, or literal-text question | Returns one ordered CBM-first receipt; read every attempt and do not rerun a listed attempt. |
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

## 5. Output & Completion Contract

- **Success:** Return exactly these four sections and preserve their order:

  ```text
  === SEARCH STRATEGY ===
  Targets: [Component Map, Symbol Inventory, Heuristic Targets]
  Strategy: [Why this pattern is being searched]
  === EXECUTION TRACE ===
  Primary Tool Status: [SUCCESS / FALLBACK_TRIGGERED]
  Fallback Actions: [List staggered fallback queries executed, if any]
  === SYSTEMATIC ANALYSIS ===
  Data Flow Map: [Input -> Processing -> Output path discovered]
  Structural Divergence: [What was discovered vs. what was expected]
  === FINAL DISCOVERY REPORT ===
  [Clear, raw, evidence-backed answer with exact filenames and line references]
  ```

  The authoritative serialization below is the exact contract. Preserve its
  headings, field labels, bracketed placeholders, and order literally:

  ```text
  === SEARCH STRATEGY ===
  Targets: [List symbols/paths]
  Strategy: [Why this pattern is being searched]
  === EXECUTION TRACE ===
  Primary Tool Status: [SUCCESS / FALLBACK_TRIGGERED]
  Fallback Actions: [List staggered grep queries executed, if any]
  === SYSTEMATIC ANALYSIS ===
  Data Flow Map: [Input -> Processing -> Output path discovered]
  Structural Divergence: [What was discovered vs. what was expected]
  === FINAL DISCOVERY REPORT ===
  [Clear, raw, evidence-backed answer to the user query containing exact filenames and line references]
  ```

  The report must include exact filenames and line references, the primary
  status, every fallback action or an explicit no-fallback reason, the data
  flow, structural divergence, relevance, uncertainty, and either refinement
  evidence or bounded exhaustion.

- **Proof:** The strategy receipt, primary or fallback search receipts,
  retrieved fragments, input-to-processing-to-output trace, reference checks,
  divergence comparison, identity evidence, snapshot limitation, and
  line-reference audit establish the result. A plausible explanation without
  those receipts is not completion.
- **Failure:** State the exact stage, query, missing evidence, tested
  hypothesis, and unresolved uncertainty. Return to strategy refinement when a
  dead end is reached; hand an implementation request to its owner; never
  claim a root cause or completion from a partial search.

## 6. Evaluation Anchors

- **Canonical:** A narrow query returns a repo-search-owned CBM-first receipt
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
  inspection validation, strategy markers, fallback predicates and order,
  exact report headings, line-reference checks, and the `/skill-manager`
  frozen matrix independently verify the result.
