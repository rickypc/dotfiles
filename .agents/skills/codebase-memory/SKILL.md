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
once. Stop and report the exact command output when readiness remains
unavailable.

Allowed roots are one repository/project root, the user-home root, and the
private KB root. Never index a subdirectory as a separate project.

Use the smallest read that answers the question. Commands are exact flags, not
JSON payloads.

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
CBM_LOG_LEVEL=error codebase-memory-mcp cli trace_path --project "<cbm-index>" --function-name "<qualified-name>" --direction both --depth 3 --mode calls
CBM_LOG_LEVEL=error codebase-memory-mcp cli detect_changes --project "<cbm-index>" --scope "<path-or-scope>"
CBM_LOG_LEVEL=error codebase-memory-mcp cli get_architecture --project "<cbm-index>" --path "<directory-prefix>"
CBM_LOG_LEVEL=error codebase-memory-mcp cli query_graph --project "<cbm-index>" --query '<cypher-query>' --max-rows 100
```
