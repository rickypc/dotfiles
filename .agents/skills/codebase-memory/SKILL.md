---
name: codebase-memory
description: Discover approved repository, home, or private-KB code graphs through the shared codebase-memory wrapper.
---

# Codebase Memory

Invoke this skill only as `/codebase-memory`. Callers must not invoke
implementation details or fallback search directly. The command details below
are internal implementation owned by this skill.

Use only the shared `<agents-root>/scripts/codebase-memory.ts` wrapper commands
with validated flags and request files. Never invoke the underlying engine
directly. Never use inline JSON arguments, destructive project operations,
or an unapproved root.
The wrapper returns machine-readable JSON receipts; read those receipts before
choosing any next step.

## Deterministic fallback and search correctness

Fallback is an expected, deterministic outcome, not a degradation by itself.
Interpret the receipt before acting:

| Receipt result | Meaning | Caller action |
| --- | --- | --- |
| `source: "cbm"` | CBM returned a JSON result containing the requested query. | Use the CBM result; do not run `rg` or another backend manually. |
| `source: "rg"` | CBM was unavailable or had no requested match, so the wrapper ran its ordered textual fallback. | Use the returned fallback output and state that the source was `rg`; do not repeat a listed attempt. |
| `source: "none"` | Neither CBM nor the ordered fallback found a result. | Report not-found with the receipt; do not invent a path or retry a listed attempt. |

The search path is deterministic: CBM graph, CBM code search, exact literal
content, case-insensitive literal content, then filename discovery. A wrong
answer can still occur when the query is too broad, the result is semantically
irrelevant, or the indexed snapshot does not reflect current uncommitted
content. That is a query/snapshot limitation, not random fallback behavior.
Use the smallest symbol, literal, or path-bearing query that answers the
question. If the receipt found a broad result that does not answer the actual
question, issue one new narrower `/codebase-memory` query; do not bypass the
wrapper with independent discovery commands or a guessed search path. Treat a ready
index as engine readiness, not proof that an uncommitted working tree and the
indexed snapshot are identical; report that limitation when it affects the
claim.

This skill is the sole owner for CBM command syntax. List projects, resolve the
intended index by its returned `name`, inspect status, index only when no
matching project index exists, re-check status, then retry the requested read
once. An AIDLC `<cbm-index>` is that returned project name, never an absolute
path or a made-up slug. Stop and report the exact command output when readiness
remains unavailable.

Allowed roots are one repository/project root, the user-home root, and the
private KB root. Sharing a parent directory never makes two repositories one
project. A separately indexed repository or private-KB root remains valid even
when it is nested under another indexed root or excluded from that parent’s
graph; choose by the project list and the intended root, not path ancestry.

Use the smallest read that answers the question. Commands are exact flags, not
JSON payloads. Apply `aidlc/knowledge/shared/command-catalog.md` to every
derived command table.

## Command catalog

| Priority | When | Command | Result | Next |
| --- | --- | --- | --- | --- |
| 1 | One code, symbol, call-path, architecture, or literal-text question is needed. | `bun <agents-root>/scripts/codebase-memory.ts discover "<approved-root>" "<cbm-index>" "<query>"` | One ordered CBM-first fallback receipt. | Read its attempts; never rerun one listed attempt. |
| 2 | Several independent CBM reads are needed for one research decision. | `bun <agents-root>/scripts/codebase-memory.ts inspect "<approved-root>" "<absolute-jsonl-request-path-under-os-tempdir>"` | One resolved CBM index, one readiness result, and one ordered entry per requested read. | Use the receipt; do not run its individual CBM commands separately. |

The inspection request is JSONL only as wrapper-local input. Every nonblank line
is one validated operation; the wrapper sends only documented backend flags:

```jsonl
{"operation":"architecture","path":"<directory-prefix>"}
{"operation":"schema"}
{"operation":"search-graph","namePattern":"<regular-expression>","label":"<graph-label>","limit":<positive-integer>}
{"operation":"snippet","qualifiedName":"<qualified-name>"}
{"operation":"trace","qualifiedName":"<qualified-name>","direction":"<inbound-or-outbound>","depth":<positive-integer>}
{"operation":"search-code","pattern":"<literal-pattern>","limit":<positive-integer>}
```

For a keyword or symbol discovery request, use the shared fallback command
instead of separately retrying CBM or `rg`. It reads CBM first. A CBM graph
result counts only when it contains the requested query; unrelated fuzzy/BM25
results do not suppress fallback. When CBM has no such match or is unavailable,
it runs only this ordered cascade: exact literal
content, case-insensitive literal content, then filename discovery. It stops
at the first match and returns a receipt for every executed or skipped attempt.
Read that receipt before choosing any further search; never repeat a listed
attempt.

```bash
bun <agents-root>/scripts/codebase-memory.ts discover "<approved-root>" "<cbm-index>" "<query>"
```
