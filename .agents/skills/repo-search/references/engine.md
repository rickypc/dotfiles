# Repo Search Engine Reference

Branch-only detail for the wrapper engine in `utils/repo-search.ts`,
`utils/repo-search-transport.ts`, and `scripts/repo-search.ts`. The caller-facing contract lives in
[SKILL.md](../SKILL.md); the binary route table lives in [binary-router.md](binary-router.md).

## Transport probe

`probeRepoSearchTransport` runs once per wrapper invocation and is the only authority on backend
availability. It tries, in order:
1. **MCP stdio transport (primary):** spawn the backend binary with no arguments as a stdio MCP
   server, complete the `initialize` handshake, and issue one `tools/call list_projects` probe. The
   official `@modelcontextprotocol/sdk` client is used when installed; a zero-dependency built-in
   JSON-RPC client is the automatic fallback, and both speak the same protocol.
2. **CLI transport (fallback):** run `codebase-memory-mcp cli --quiet --json <tool>` subcommands and
   parse the raw MCP result envelope the CLI prints, so both transports share one parser.
3. **None:** with no answering transport the engine runs the staged local search only and records
   the failure as the transport receipt.

`REPO_SEARCH_TRANSPORT_FORCE` (`mcp`, `cli`, or `none`) and `REPO_SEARCH_BACKEND_BINARY` override
the probe for testing. A spawn failure, handshake timeout, or backend denial never throws to the
caller: it degrades to the next transport and lands in `attempts[0]` as the transport receipt.

## Response envelope

Every route prints exactly one JSON envelope with identical keys:

```json
{
  "ok": true,
  "status": "found | empty | error",
  "verb": "search | read | inspect",
  "transport": "mcp | cli | none",
  "source": "graph | code | symbol | file | binary | fallback | none",
  "query": { "root": "...", "index": "... | null", "input": ["..."] },
  "results": [
    { "kind": "...", "name": "...", "location": "...", "detail": "..." }
  ],
  "reliability": {
    "backend": "...",
    "indexedAt": "...",
    "note": "...",
    "caveats": []
  },
  "attempts": [
    { "strategy": "...", "status": "...", "command": "...", "detail": "..." }
  ],
  "next": ["..."]
}
```

`ok` is false only for hard errors (rejected root, missing transport for a symbol read); `status`
says what happened, `source` says which stage answered, `results[].location` says where the
information was found, and `reliability` carries the backend identity, the index freshness
(`indexedAt`), and the caveats (snapshot drift, truncation, missing index, transport failure). The
wrapper exits 1 exactly when `status` is `error`.

## Backend table parsing

The backend emits human-oriented tables inside the MCP envelope; the engine parses them
deterministically instead of trusting raw output:
- `list_projects`: rows of `name root_path branch` after the `projects:` header; double-quoted paths
  with spaces are honored.
- `index_status`: top-level `key: value` lines; readiness is exactly `status: ready`, freshness is
  `indexed_at`.
- `search_graph` and `search_code`: rows after the `results:` header with
  `qn label file lines [rank|matches...]`; `search_code` also yields the `directories:` cluster used
  for keyword-surrounding results. Graph rows count only when the query appears in the identity
  fields (`qn` or `file`).
- Error envelopes (`isError: true` with `structuredContent.error`) become attempt receipts and
  hints, never silent emptiness.

## Search pipeline

1. Resolve the index from the project list by explicit root containment (never by parent-directory
   guessing); no match or a not-ready index becomes a caveat and the run continues on the local
   fallback. Search never indexes.
2. Run `search_graph`, then `search_code` when graph found nothing; merge parsed rows into `symbol`
   results plus the `directories` cluster.
3. When the query has two or more tokens and two distinct symbols matched, trace both qualified
   names inbound and outbound at depth one and merge a `connection` result.
4. Only when indexed discovery found nothing, run the staged local search (`rg-literal`,
   case-insensitive literal, then file names), parse `path:line` locations, and gate the located
   candidates through the binary content gate. Every staged pass runs `rg` with `--hidden
   --no-ignore`, so dotfiles and a parent repository's ignore rules cannot blind the fallback to
   the approved root; the `!**/.git/**` and `!**/node_modules/**` exclusions still apply.

## Read classification

`read` classifies the target deterministically before any fetch: URL (`http(s)://`), PID
(digits only), absolute file path, dotted qualified name (symbol), then exact process name. Text
files return a bounded numbered fragment (200 lines by default, `path:start` or `path:start-end` for
a range); binary or bundle-shaped files, URLs, PIDs, and process names route through the binary
router. Symbol reads resolve the index, then index only when no matching index exists, re-check
status, and retry the requested read once before reading the snippet.

`inspect` requires a ready matching project index. If no index matches the root, the wrapper returns
the `resolve-index` error receipt and runs none of the requested operations. It does not create or
retry an index.

## Redaction

`redactBackendStorePaths` rewrites every occurrence of the backend storage directory to
`<backend-store>` across envelope text before output. The engine never reads, lists, or passes that
directory; the backend binary owns it. Adjacent sandbox denials (trash moves, KB-root writes,
process listing, coverage writes) are environment failures, not transport failures, and are reported
as their own attempt receipts.
