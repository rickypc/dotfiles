---
name: codebase-memory
description: Discover approved repository, home, or private-KB code graphs through the CBM CLI.
---

# Codebase Memory

Use only `CBM_LOG_LEVEL=error codebase-memory-mcp cli` commands with flags.
The environment variable keeps successful output machine-readable JSON while
preserving error-level diagnostics. Never use MCP, inline JSON arguments,
destructive project operations, or an unapproved root.

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
| 3 | The runtime explicitly needs one primitive operation that is not represented by discovery or inspection. | Use the exact flag command from the primitive catalog below. | One primitive CLI response. | Do not add a shell wrapper, JSON payload, help probe, or guessed retry. |

The inspection request is JSONL only as script-local input. Every nonblank line
is one validated operation; CBM receives documented flags only:

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
bun ~/.agents/scripts/codebase-memory.ts discover "<approved-root>" "<cbm-index>" "<query>"
```

```bash
CBM_LOG_LEVEL=error codebase-memory-mcp cli list_projects
CBM_LOG_LEVEL=error codebase-memory-mcp cli index_status --project "<cbm-index>"
CBM_LOG_LEVEL=error codebase-memory-mcp cli index_repository --repo-path "<indexed-root>" --name "<cbm-index>" --mode full
CBM_LOG_LEVEL=error codebase-memory-mcp cli get_graph_schema --project "<cbm-index>"
CBM_LOG_LEVEL=error codebase-memory-mcp cli search_graph --project "<cbm-index>" --name-pattern '.*<symbol-or-keyword>.*' --label "<label>" --limit 20
CBM_LOG_LEVEL=error codebase-memory-mcp cli search_code --project "<cbm-index>" --pattern "<literal>" --mode compact --limit "<limit>"
CBM_LOG_LEVEL=error codebase-memory-mcp cli get_code_snippet --project "<cbm-index>" --qualified-name "<qualified-name>"
CBM_LOG_LEVEL=error codebase-memory-mcp cli trace_path --project "<cbm-index>" --function-name "<qualified-name>" --direction "<inbound-or-outbound>" --depth "<positive-integer>" --mode calls
CBM_LOG_LEVEL=error codebase-memory-mcp cli detect_changes --project "<cbm-index>" --scope "<path-or-scope>"
CBM_LOG_LEVEL=error codebase-memory-mcp cli get_architecture --project "<cbm-index>" --path "<directory-prefix>"
CBM_LOG_LEVEL=error codebase-memory-mcp cli query_graph --project "<cbm-index>" --query '<cypher-query>' --max-rows 100
```
