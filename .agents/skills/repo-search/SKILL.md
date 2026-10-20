---
name: repo-search
description: >-
  Deterministic repository, file, and binary-content discovery engine behind one wrapper script. The
  script probes the codebase-memory transports itself (MCP stdio first, CLI fallback, local staged
  search when neither answers), resolves the project index, runs graph, code, connection, and binary
  searches, and prints one unified JSON response contract with status, transport, source, located
  results, and reliability on every route. A content gate classifies binaries by magic bytes and
  mime type and routes them through an eighteen-row binary router. Callers pass an approved root
  plus a query; the script does the rest and the backend storage never leaks.
argument-hint: <approved-root> <query...> | read <approved-root> <target> [query...] | inspect <approved-root> <jsonl-path>
capabilities:
  - Script-owned transport probe (MCP stdio primary, CLI fallback)
  - One unified JSON response contract on every route
  - Deterministic three-verb caller grammar
  - Backend-store redaction (<backend-store>)
  - Content-based binary gate plus eighteen-row binary router
  - Ordered staged fallback with named receipt strategies
---

# Repo Search

Use this skill for every repository, file, or binary discovery question: exact paths, symbols,
callers, callees, configuration, documentation, architecture, file content, the connection between
two symbols, files surrounding a keyword, and how a shipped binary, bundle, archive, or capture
works. repo-search owns the wrapper script, the response contract, the binary content gate, and the
binary router. `/knowledge-base` owns durable private-KB records; `/skill-manager` owns this
package's lifecycle.

## 1. Role & Scope

- **Role:** One deterministic wrapper script that answers repository and binary-content questions
  with evidence and receipts.
- **Trigger:** Mandatory caller-facing route for every repository/file discovery request, including
  locating a single named file; callers must not decide to skip it.
- **Boundary:** Discover and analyze only; this skill never edits source files and never owns
  durable private-KB records. Route implementation to the owning skill.

## 2. Usage

```text
/repo-search search <approved-root> <query...> # one query through the whole pipeline
/repo-search read <approved-root> <file-or-URL-or-PID-or-process-or-symbol> [query...]
/repo-search inspect <approved-root> <jsonl-request-path> # batch independent indexed reads
```

The wrapper is `bun <agents-root>/scripts/repo-search.ts` with the same three verbs; the bare
two-argument form is an alias for `search`; the script executes every backend operation itself and
prints exactly one JSON envelope - the caller never runs a backend command, decodes a raw backend
table, or repeats a backend call. `inspect` request files must live under the operating-system
temporary directory.

Scenario request/response patterns - the supported discovery scenarios with the exact wrapper
command, the envelope fields each scenario answers through, and how each scenario is tested - live
in [usage-patterns.md](references/usage-patterns.md).

## 3. Immutable Operational Rules

- **Script-owned transport:** The script probes the transports once per run; the MCP stdio transport
  is primary and the CLI transport is the fallback, and the staged local search answers when neither
  transport works. The caller never chooses, bans, or hand-runs a transport, and never claims the
  backend is unavailable without the script's transport receipt.- **Backend-store isolation:**
  Callers never access the backend storage; the backend binary owns it and every path inside it is
  redacted to `<backend-store>` in all wrapper output. A cache-private or sandbox denial is a
  transport failure - never an empty result and never backend unavailability - and stays inside the
  envelope's transport receipt.
- **Wrapper-only:** Never invoke the underlying engine directly, including the backend CLI or a
  hand-spawned MCP server. Do not use `find`, `rg`, `grep`, shell globs, or ad-hoc reads as a
  caller-side substitute for the wrapper.
- **Approved root:** The approved root is explicit and never inferred, and every file target must
  stay under it.
- **Index discipline:** search never creates an index - a missing or not-ready index is a caveat and
  the local fallback answers; `read` and `inspect` index only when no matching index exists, then
  `re-check status` and `retry the requested read once`.
- **Query pipeline:** The script runs graph search, then code search, merges the hits (graph matches
  count only through identity fields: `name`, `qualified_name`, `file_path`, `path`), traces the
  connection between two symbols when the query names both, clusters the files surrounding a
  keyword, and falls back to the staged literal search (`rg-literal`, case-insensitive literal,
  file names, hidden- and ignore-transparent under the approved root via `--hidden --no-ignore`)
  only when indexed discovery finds nothing. The staged fallback stops at the first exact literal
  match and the caller must never repeat a listed attempt.
- **Binary rules:** The content gate classifies every located candidate by bytes - a NUL byte or
  invalid UTF-8 plus magic bytes, with `file` mime corroboration, never extension-only. classify
  always, decode as needed. The eighteen-row binary router in
  [binary-router.md](references/binary-router.md) owns the route rows, the check-then-install idiom
  for missing routed tools, extraction under the operating-system temporary directory that work on a
  copy without creating ephemeral project indexes, and receipt strategies named
  `binary-gate:classify`, `binary-tool-check`, `binary-tool-install`, and `binary-route:*`. The
  website and running-app rows fire only on an explicitly provided target, never an inferred one.
  The backend is the `codebase-memory-mcp` binary and its transports are probed, never hand-run.

## 4. Input & Context Schema

- **Required:** One approved absolute root and one of: a query string for `search`; a target for
  `read` (an absolute file path, a dotted qualified name, a URL, a PID, or an exact process name)
  plus optional binary queries; one JSONL request path for `inspect`.
- **Optional:** Known subsystem boundaries, prior receipts, or one bounded batch of distinct
  independent reads through `inspect`. Duplicate normalized queries are rejected.
- **Unknowns:** A missing index, a denied transport, or an empty result is reported in the envelope
  with its caveat - never filled with a guess. never guess paths, never guess symbols, never guess
  causes, and never guess completion.

## 5. Ordered Execution Chain

```text
request -> parse verb and approved root -> transport probe -> run one wrapper command
        -> read the JSON envelope -> answer from results and reliability -> stop
```

1. **Intake:** Confirm the approved root and the question, then run exactly one wrapper command.
   `read` classifies the target deterministically: URL, PID, absolute file, dotted symbol, then
   exact process name.
2. **Read the envelope:** The envelope states what happened (`status`), how it ran (`transport`,
   `source`), where the information was found (`results[].location`), how reliable it is
   (`reliability.indexedAt`, `reliability.caveats`), every executed or skipped attempt (`attempts`),
   and the suggested next step (`next`).
3. **Answer:** Report the evidence-backed answer. Stop when the question is structurally answered;
   when the envelope is empty, follow `next` or stop - never guess.

## 6. Output & Completion Contract

- **Script contract:** one unified JSON response contract with the same schema on every route -
  `{ok, status, transport, source, query, results, reliability, attempts, next}` - whether the
  answer came from the MCP transport, the CLI transport, the local staged fallback, or the binary
  router. Binary evidence flows through the same unified contract with `source: "binary"`.
- **Success:** Answer with these four fields:

  ```text
  Finding: [Evidence-backed answer]
  Evidence: [Locations from results[], with file and line references]
  Search status: [FOUND / EMPTY / ERROR, with the transport and source tokens]
  Uncertainty: [Remaining caveat from reliability, or none]
  ```

- **Failure:** Name the failing stage, the envelope status, and the exact receipt; hand
  implementation or skill-package changes to the owning skill and never claim a root cause from a
  partial envelope.

## 7. Evaluation Anchors

- **Canonical:** A search returns one envelope with located results and reliability; a read returns
  one fragment, snippet, or binary receipt; an inspect returns one receipt per declared read.
- **Boundary:** A guessed root, a repeated attempt, a direct backend invocation, an unredacted
  storage path, a denial read as emptiness, or an answer without the envelope is a stop, not a
  result.
- **Challenge:** With no matching index the search still answers from the staged fallback,
  hidden-file-aware and without an index; with no transport at all the envelope says so in
  `reliability.caveats` instead of failing silently.
- **Independent verifier:** Wrapper receipts, the frozen matrix in `evals/`, envelope schema checks,
  and the `/skill-manager` validation chain verify the contract.
