# Repo Search Engine Reference

Branch-only detail for the wrapper engine in `utils/repo-search.ts`,
`utils/repo-search-transport.ts`, and `scripts/repo-search.ts`. The caller-facing contract lives in
[SKILL.md](../SKILL.md); the binary route table lives in [binary-router.md](binary-router.md).

## Transport probe

`probeRepoSearchTransport` runs once per wrapper invocation and is the authority on backend
availability. With no override, it tries these routes in order:

1. **MCP stdio:** try the `@modelcontextprotocol/sdk` client, then the built-in stdio client. Each
   sends `initialize` and `tools/call list_projects`.
2. **CLI:** if neither MCP client answers, run the `codebase-memory-mcp cli --quiet --json <tool>`
   subcommand and parse its result envelope.
3. **Staged local search:** when no backend transport answers, continue with the local search stage.
   The wrapper also runs this stage when indexed discovery finds no result.

`REPO_SEARCH_TRANSPORT_FORCE` changes the backend probe for testing:

- `mcp` (`REPO_SEARCH_TRANSPORT_FORCE=mcp`) limits the probe to the MCP client chain. If neither
  client answers, the probe records an error and does not try the CLI; the wrapper can still
  continue with staged local search.
- `cli` limits the probe to the CLI transport.
- `none` disables backend transports; the wrapper can still use staged local search.

`REPO_SEARCH_BACKEND_BINARY` overrides the backend binary. A spawn failure, `initialize` handshake
timeout, or backend denial is captured in `attempts[0]` as the transport-probe receipt instead of
being thrown to the caller. On the default route, an MCP failure is followed by the CLI probe.

Every spawned backend child receives a pinned child environment: `HOME` from the platform resolver
and `XDG_CACHE_HOME` from the caller environment or `<home>/.cache` when unset. The pin keeps the
backend's canonical cache root resolvable in stripped caller environments (the `cache-resolve`
failure) without touching `CBM_CACHE_DIR` or `CBM_RUNTIME_DIR`, which must stay shared with every
other CBM client on the account or the admission barrier rejects the child. A `cache-private` chmod
denial is the other known signature: the spawning context may not write the cache root, so run the
wrapper where the root is writable or keep a standing `codebase-memory-mcp daemon start` running.

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
  "results": [{ "kind": "...", "name": "...", "location": "...", "detail": "..." }],
  "reliability": {
    "backend": "...",
    "indexedAt": "...",
    "note": "...",
    "caveats": []
  },
  "attempts": [{ "strategy": "...", "status": "...", "command": "...", "detail": "..." }],
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
- `index_status`: top-level `key: value` lines. The index is ready only when the line is exactly
  `status: ready`. Any other status, such as `status: indexing`, means not ready, even when
  `indexed_at` is present. `indexed_at` reports freshness only.
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
   candidates through the binary content gate. Every staged pass runs `rg` with
   `--hidden --no-ignore`, so dotfiles and a parent repository's ignore rules cannot blind the
   fallback to the approved root; the `!**/.git/**` and `!**/node_modules/**` exclusions still
   apply.

## Read classification

`read` classifies the target deterministically before any fetch: URL (`http(s)://`), PID (digits
only), absolute file path, dotted qualified name (symbol), then exact process name. Text files
return a bounded numbered fragment (200 lines by default, `path:start` or `path:start-end` for a
range); binary or bundle-shaped files, URLs, PIDs, and process names route through the binary
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
