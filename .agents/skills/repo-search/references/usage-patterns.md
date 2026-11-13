# Repo Search Usage Patterns

Documented scenario patterns for the three-verb wrapper in [SKILL.md](../SKILL.md). Every row gives
the command shape, the envelope fields the scenario answers through, and how the scenario is tested.
The wrapper is `bun <agents-root>/scripts/repo-search.ts`; every route prints the one unified JSON
envelope, so the response contract never changes between scenarios.

## Scenario patterns

| Scenario                                       | Command pattern                                              | Envelope reading                                                                                               | How it is tested                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| File or path discovery with no index           | `search <root> <literal>`                                    | `source: "fallback"`, `results[].location` as `path:line`, slot-tagged results, caveat notes the missing index | Matrix `repo-search-path-only`; live: search an unindexed root for a literal that exists                                  |
| Symbol, class, or attribute on an indexed root | `search <root> <name>`                                       | `source: "graph"`, identity-field matches, `reliability.indexedAt`                                             | Matrix `repo-search-identity-fields`; live: search an indexed root for one function name                                  |
| Connection between two symbols                 | `search <root> "<a> ... <b>"`                                | one `connection` result built from the depth-one inbound and outbound traces                                   | Live: name two symbols that call each other; `engine.md` Search pipeline step 3                                           |
| Files surrounding a keyword                    | `search <root> <keyword>` with no graph identity-field match | merged `symbol` results plus the `directories` cluster                                                         | Live: search an indexed root for a code literal absent from symbol names and file paths                                   |
| Text fragment or range                         | `read <root> <file> [query...]` or an explicit line range    | `source: "file"`, `location` is `path:start-end`                                                               | Live: read a known file with and without a query (the fragment is unchanged), then read an explicit line range            |
| Symbol snippet                                 | `read <root> <dotted.qualified.name>`                        | `source: "symbol"`, snippet lines; indexes once when no index matches                                          | Live: read a qualified name resolved from the indexed root                                                                |
| Binary content                                 | `read <root> <binary-file> [query...]`                       | `source: "binary"`, `binary-gate:classify` and `binary-route:*` receipts                                       | Matrix `repo-search-binary-gate`; live: read one sqlite or asar file with a query                                         |
| Several indexed reads for one decision         | `inspect <root> <jsonl>`                                     | one receipt per declared operation, in request order                                                           | Live: declare `architecture`, `search-graph`, and `search-code` in one request file                                       |
| Bounded multi-repository dependency sweep      | `search <root> <package-or-advisory>` per root               | one envelope/status per root; inspect manifests, locks, Dockerfiles, and bundled artifacts                     | Matrix `repo-search-multi-root-each-root`, `repo-search-dependency-artifact-scope`; live: account for every expected root |
| Inspect with no matching index                 | `inspect <root> <jsonl>`                                     | `status: "error"`, a `resolve-index` attempt, and no operation results                                         | Live: inspect an unindexed root and confirm that the wrapper returns an error without indexing                            |
| Transport loss (backend down or denied)        | any verb                                                     | transport receipt in `attempts[0]`; the staged fallback answers or the caveat says no transport                | Matrix `repo-search-transport-receipt`; live: run once with `REPO_SEARCH_TRANSPORT_FORCE=none`                            |
| Tokenized multi-keyword fallback               | `search <root> "<word1> <word2> ..."`                        | whole-query slots, then `rg-token:<keyword>` slots; `results[].slot` names each slot's keyword                 | Live: search an unindexed root for a multi-word query and confirm one tagged result group per answered token slot         |

## Reading the envelope

Answer through the same fields on every route: `status` (found, empty, error), `transport` and
`source` (how and where), `results[].location` and `results[].slot` (the located evidence and its
fallback slot keyword), `reliability` (backend, `indexedAt`, `caveats`, and `spillFile` when the
budgets spilled the full output), `attempts` (every executed or skipped strategy as a strategy
code with a compact status - the SKILL.md table is the 1:1 strategy-to-command lookup, and
`--verbose` restores the full command strings), and `next`. A missing index, a denial, or an empty
result is a reported caveat - never a guess and never a reason to repeat a listed attempt.

For a bounded multi-repository sweep, use the supplied inventory as the expected-root list and run
the search independently against each root. An empty result applies only to that root. Missing,
failed, or uninspected roots remain unverified. For dependency exposure, include transitive and
packaged sources such as lockfiles, Dockerfiles, base-image packages, and relevant bundled
artifacts.

## Staged-fallback scope, budgets, and the raw escape

The default staged `rg` sweep keeps `--hidden`, respects ignore files, and excludes `coverage/`,
`dist/`, and `build/` alongside `!**/.git/**` and `!**/node_modules/**`, so build output and
coverage reports cannot bury real content. Slot results are budgeted to at most 8 results per slot
with 200-character details; when the budgets cut output, the full output spills to one
operating-system temporary file carried in `reliability.spillFile`. When a truly unfiltered sweep is
required, add the `--raw` flag: it restores the `--hidden --no-ignore` pair and drops the
preconfigured excludes, so dotfiles and a parent repository's ignore rules cannot hide live content
from an explicitly approved search.
