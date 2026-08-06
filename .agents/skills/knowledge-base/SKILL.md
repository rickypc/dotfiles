---
name: knowledge-base
description: Retrieve, capture, validate, and distill durable knowledge stored in the Open Knowledge Format (OKF).
---

# Knowledge Base

This skill manages durable knowledge through a retrieve, capture, validate, and
distill lifecycle. OKF means Open Knowledge Format: the Markdown/frontmatter
representation and indexing convention used for persisted concepts. The
knowledge itself may concern projects, organizations, teams, policies, or prior
decisions; OKF is the format, not the topic. This skill manages knowledge in
that format; it is not a reference about the OKF specification.

Durable KB records are outside `<agents-root>` at
`~/Library/Application Support/agent-knowledge-base` (macOS) or
`${XDG_DATA_HOME:-~/.local/share}/agent-knowledge-base` (Linux). Store only validated,
durable knowledge. Never store raw chat, secrets, speculation, or a log.

Concept paths must match
`^(<cbm-index>|shared)/<subject>/<concept>\.md$`. Each KB root and subject
directory has an `index.md`; concepts use Markdown frontmatter with required
`type`, `title`, `description`, and `tags`.

The command tables below are owned by this skill and its scripts. Any fixed
reconciliation request is an absolute path under the operating system
temporary directory; the request is parsed by this runtime, never passed to an
external dependency as a raw payload.

## Fixed JSON request boundary

Use this when a KB reconciliation or capture request must be materialized as a
JSON file, especially when its Markdown contains backticks, dollar signs,
quotes, or newlines:

```text
bun <agents-root>/scripts/write-json.ts "<absolute-json-output-path>" <<'JSON'
<valid-json-object>
JSON
```

Materialize requests in two separate commands. First run `mktemp` alone and
retain the absolute path it prints. Never guess `/tmp`, `/private/tmp`, or a
platform-specific path because the writer checks the actual `os.tmpdir()`.
Then pass that printed path literally as the writer's one output-path argument
in a second command. Do not use shell variables, command substitution, or
backtick command substitution in the writer command. Keep the heredoc
delimiter exactly quoted as `<<'JSON'`. Encode Markdown backticks and dollar
signs inside JSON strings as `\\u0060` and `\\u0024`; the writer decodes those
escapes while preserving the intended content. Invoke reconcile or capture in
a separate command with the same literal path after the writer succeeds.

The command has exactly one argument: `<absolute-json-output-path>`. It reads
the JSON from stdin, parses it before any write, formats it deterministically,
and refuses malformed JSON, relative paths, or paths outside `os.tmpdir()`.
Keep the quoted `JSON` heredoc delimiter; it is the shell-safety boundary.
Never pass an object to a string-only `content` field, never place backtick-rich
JSON in a double-quoted shell argument, and do not substitute Python or an
inline shell writer. Invoke `write-json.ts` directly and bypass the built-in
`write` tool entirely for JSON materialization; there is no tool-call fallback.
This writer owns only safe materialization; this skill still owns the request
schema and reconciliation decision.
The old `JSON.stringify(request)` fallback is prohibited. Do not use
`JSON.stringify(request)` in any tool call.

The skill identifies the boundary as string-only and selects the TypeScript
writer with an exact command and arguments. The writer rejects before writing
and the command remains fixed-arity and deterministic. The normal route uses
atomic approve --context with the exact binding arguments. approve alone is
allowed, and a returned resolve-knowledge-context action is followed exactly
once. The parser captures every field the renderer emits and the merge forwards
structured records rather than identity strings.

Retrieve project, organization, team, policy, or prior-decision knowledge only
when it materially informs the work. Capture a lesson only with observed
symptom, cause, durable fix, and evidence. Use `/codebase-memory` only to speed
discovery when its KB-root index is ready. After a concept update, invoke
`/md-compress` through its `begin` and returned `finalize` actions, then validate
OKF structure and protected content. Its temporary backup is outside the KB tree.

Use the KB at the point it can change a decision: before research when relevant
knowledge exists, after validation for durable results, or immediately for an
explicit capture. Resolve the correct `<cbm-index>` or `shared` scope before
writing. Do not create a new concept when a matching concept can be safely
updated. A new or updated concept must include source and verification evidence
in its body, then its parent `index.md` must list it.

## Cross-topic distillation

One capture request may contain several atomic lessons. Do not turn that fact
into one file per request or duplicate the same rule in several files. First use the
related lookup to return candidate concepts from their titles, descriptions,
and tags. Then make one explicit disposition for each atomic lesson:

| Disposition | Use when | Required result |
| --- | --- | --- |
| `new-primary` | No current concept owns the rule. | Create one concept as the one canonical owner. |
| `update-existing` | A current concept already owns the rule's subject. | Update that concept with verified, non-duplicated content. |
| `link-related` | A separate concept supplies constraints, context, or a dependent practice. | Use bundle-relative Markdown links between the concepts; do not copy the related rule. |

The semantic owner is a reviewed decision, not an inference from a directory
name. Do not infer a taxonomy. Do not move, delete, or merge existing concepts
during reconciliation. Ambiguous ownership is a user decision.

For an approved reconciliation, build one fixed reconciliation
request JSON file at an absolute path under the OS temporary directory with the
TypeScript writer above, then invoke the deterministic command below. The
request JSON must be serialized to disk as text; the runtime reads it back via
`readText` and parses it as JSON.

The request schema is the `ReconciliationPlan` interface in
`utils/knowledge-base.ts`. All three top-level fields are REQUIRED:

- `canonicalPath` (`string`): exactly one operation's `relativePath` that
  owns the canonical rule for this reconciliation. Every reconciliation must
  declare exactly one canonical owner; pick the operation that best owns the
  central lesson.
- `links` (`array`): may be empty `[]`. Each link has `from` and `to` fields
  that MUST equal two operations' `relativePath` values, and the `from`
  operation's `body` MUST contain the markdown link `](<to-relativePath>)`
  (the runtime permits the bundle-relative `](<to-relativePath>)` form).
  Omit a link rather than declare one whose source body lacks the marker.
- `operations` (`array`, non-empty): each operation has `body` (markdown
  string, non-blank), `disposition` (`new-primary` | `update-existing`),
  `evidence` (non-blank string), `metadata` (object with `type`, `title`,
  `description`, `tags` array), and `relativePath` matching
  `^(<cbm-index>|shared)/<subject>/<concept>\.md$`.

The runtime validates duplicate paths, create/update preconditions, exactly
one canonical owner, every link's endpoints exist as operations, and every
declared link's source body contains the markdown target token. It validates
mechanical integrity; it cannot prove semantic equivalence or decide ownership
for the caller.

Generic request template (replace placeholders; do NOT keep angle brackets
in the final JSON):

```json
{
  "canonicalPath": "<cbm-index-or-shared>/<subject-a>/<concept-a>.md",
  "links": [
    {
      "from": "<cbm-index-or-shared>/<subject-a>/<concept-a>.md",
      "to": "<cbm-index-or-shared>/<subject-b>/<concept-b>.md"
    }
  ],
  "operations": [
    {
      "disposition": "new-primary",
      "relativePath": "<cbm-index-or-shared>/<subject-a>/<concept-a>.md",
      "metadata": {
        "type": "<pattern|lesson|incident|reference|plan|preference|practice>",
        "title": "<concise title>",
        "description": "<one-line description for search discoverability>",
        "tags": ["<tag-one>", "<tag-two>"]
      },
      "body": "## Context\n\n<observed-situation>\n\n## Action\n\n<durable-fix>\n\n## Evidence\n\n- Source: <factual-source-path-or-event>\n- Verification: <observed-test-command-or-state>\n- Related concept: [Related concept](<cbm-index-or-shared>/<subject-b>/<concept-b>.md).",
      "evidence": "<factual-capture-evidence-one-sentence>"
    }
  ]
}
```

Workflow:

1. Compose the request object and invoke
   `bun <agents-root>/scripts/write-json.ts "<absolute-reconciliation-request-path>" <<'JSON'`
   directly. The heredoc delimiter must be quoted exactly; do not embed the
   payload in a double-quoted shell argument or call the built-in write tool.
2. Write to the exact absolute path printed by the standalone `mktemp`
   command; that path is already under `os.tmpdir()` and the runtime reads only
   absolute paths there.
3. Run the reconcile command below. The runtime re-reads the file from disk
   and validates every precondition before applying writes.
4. On success, run `/md-compress` `begin` on every returned source path,
   edit only the returned paths, then run the returned `finalize` action.

| Priority | When | Required inputs | Command | Result | Next |
| --- | --- | --- | --- | --- | --- |
| 1 | Find candidates before a distillation decision. | `<private-kb-root>`, `<query>` | `bun <agents-root>/scripts/knowledge-base.ts related "<private-kb-root>" "<query>"` | Validated concept candidates matching the supplied query. | Select one explicit disposition. |
| 2 | Apply an approved multi-concept reconciliation. | `<private-kb-root>`, `<absolute-reconciliation-request-path>` | `bun <agents-root>/scripts/knowledge-base.ts reconcile "<private-kb-root>" "<absolute-reconciliation-request-path>"` | Deterministic new-primary, update-existing, and link-related writes plus index receipts. | Start the returned Markdown guard for every changed concept. |

If a caller supplies a guarded reconciliation packet, honor its exact owner,
source paths, and next action; do not begin a second compression transaction.
Otherwise use the direct `related` and `reconcile` commands above.

When merging an older draft, treat the current validated KB as the starting
authority and the older draft as a candidate source. fact-check every draft-only
claim against live implementation, current tests, or another observed evidence
source before capture. Classify each claim as already-current,
confirmed-and-missing, conflicted/obsolete, or unverified. For a conflict, the
verified current fact wins; reject obsolete or unverified claims instead of
preserving them as a chronological log. Record the source and verification
evidence for each confirmed addition so a future refresh can repeat the check.

```text
<private-kb-root>/(<cbm-index>|shared)/<subject>/<concept>.md
```

Use `/codebase-memory` only for read discovery of the KB root. It does not
replace the KB indexes or authorize writing.

For one KB keyword search, invoke the combined search command. It performs
CBM discovery first, uses the shared staged `rg` fallback only when needed,
then resolves results through validated OKF concepts. Its receipt states every
CBM and `rg` attempt as `found`, `not-found`, `error`, or `skipped`. Read that
receipt and do not rerun any listed command.

CBM is read-only for KB search. Never create, rebuild, or replace a CBM index
as part of retrieval, including after KB refiling. If the configured index is
missing, stale, or not ready, use the staged `rg` fallback and ask the user to
create or refresh the named CBM index; do not invent another index.

```bash
bun <agents-root>/scripts/knowledge-base.ts search "<private-kb-root>" "<kb-cbm-index>" "<query>"
```

For organization, team, or project practices, use only validated concept
records. Organization and team records retain their precedence; project records
may live under any subject:

```text
shared/organization/<concept>.md
shared/team/<concept>.md
<cbm-index>/<subject>/<concept>.md
```

Use the required OKF metadata and evidence sections as the structure reference.
The resolver rejects a matching `ALWAYS` / `NEVER` rule conflict; do not create
placeholder organization, team, or project records.

## Retrieval discipline

Use `/knowledge-base` once in every nontrivial workflow for durable prior context and again for a verified lesson when the work produces a reusable correction. This skill owns private knowledge retrieval; it is not the repository file inventory. Use `/codebase-memory` for code, files, symbols, and call paths. Use `search-batch` for multiple independent keywords in one invocation; it rejects blank and duplicate normalized queries and runs bounded read-only work through the shared batch runner. Never run the same query twice. Every temporary request path must come from standalone `mktemp` or `os.tmpdir()` evidence, never from a guessed platform path or a placeholder.

## Batch search command

For several independent keyword searches, use one bounded command: bun agents-root/scripts/knowledge-base.ts search-batch private-kb-root kb-cbm-index query query ...

The command accepts one to four nonblank queries, rejects duplicate queries after trimming and case normalization, and uses the shared read-only batch runner. It returns one receipt per query in input order. Do not invoke the same query repeatedly or run separate commands for a batch that fits this contract.

For backtick-rich request JSON, keep one OS temporary directory and use distinct files only when the state contract requires them. The writer receives one absolute path from mktemp/os.tmpdir evidence and text on stdin; if a shell heredoc is unavailable, use one bounded stdin session with the same writer and path.
