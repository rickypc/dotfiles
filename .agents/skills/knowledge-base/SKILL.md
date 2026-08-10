---
name: knowledge-base
description: Retrieve, capture, validate, and distill durable knowledge stored in the Open Knowledge Format (OKF).
argument-hint: "<operation> <private-kb-root> <scope-or-request>"
---

# Knowledge Base

## 1. Role & Scope

This skill owns validated private-KB retrieval, capture, reconciliation, and
distillation. OKF means Open Knowledge Format: the Markdown/frontmatter
representation and indexing convention for persisted concepts, not a topic or
an excuse to retain raw conversation. The configured private-KB root is
authoritative and lives outside `<agents-root>` at the platform-specific
`agent-knowledge-base` location.

The skill is selected for a private-KB lookup, capture, validation, distillation,
or completed-plan import. It returns validated knowledge or deterministic
receipts; it does not let runtime instructions override the configured root,
create an index, infer semantic ownership, or preserve speculation.

## 2. Usage

```text
/knowledge-base <operation> <private-kb-root> <scope-or-request> # retrieve, validate, or distill private KB knowledge
```

The unannotated grammar is:

```text
/knowledge-base <operation> <private-kb-root> <scope-or-request>
```

Required: the configured private-KB root and the operation-specific scope or
request path. Use the command catalog for exact JSON/request-file forms.

## 3. Immutable Operational Rules

- Use the configured KB root and supplied repo-search indexes as authoritative. Keep
  retrieval read-only; **Never store raw chat**, secrets, speculation, or logs.
- Concept paths match
  `^(<repo-search-index>|shared)/<subject>/<concept>\.md$`. Every root and subject
  directory has `index.md`; every concept has required frontmatter `type`,
  `title`, `description`, and `tags` plus source and verification evidence.
- Do not create a new concept when an existing matching concept can be safely
  updated. Do not move, delete, or merge concepts during reconciliation.
  Ambiguous ownership is a user decision.
- Use the owning command and the required absolute temporary request-file
  transport for writes. Resolve the correct index before writing; never invent
  another index when the named one is missing or stale.
- For a concept update, guard each changed Markdown source with `/md-compress`
  `begin` and its returned `finalize`, then validate OKF structure and protected
  content. A compression backup is outside the KB tree.
- Atomic `approve --context` is the normal lifecycle route. Use context
  resolution only for recovery and follow exactly the returned lifecycle action.

## 4. Input & Context Schema

- **Required:** Configured private-KB root plus selected `<repo-search-index>`/`shared`
  scope and query, or an approved absolute request path; plan import takes one
  completed six-section plan path.
- **Optional:** One to four distinct batch queries, related-concept candidates,
  or a guarded reconciliation packet. Duplicate normalized queries are invalid.
- **Context:** Validated OKF metadata/index records, source evidence, repo-search
  readiness, current concept contents, ownership dispositions, and returned
  write receipts.
- **Unknowns:** Missing/stale index, conflicting facts, invalid metadata,
  unavailable source evidence, unclear semantic owner, or invalid operation
  requires a stop. Ask the user to create/refresh the named index or decide
  ownership; do not infer.

## 5. Ordered Execution Chain

```text
root and scope -> retrieve evidence -> choose disposition -> guarded write
                -> OKF validation -> receipt and handoff
```

1. **Intake:** Resolve the configured root, selected index, request schema, and
   ownership boundary. Retrieve context at the point it can change a decision.
2. **Retrieve:** Use validated concept records, the combined search command,
   or `related` to find current candidates. repo-search is read-only discovery for the
   KB; it never creates or rebuilds an index.
3. **Decide:** For each atomic lesson, choose one explicit disposition:
   `new-primary` when no concept owns it, `update-existing` when one does, or
   `link-related` when another concept supplies context. One canonical owner is
   required for reconciliation.
4. **Write or import:** Materialize rich JSON through the fixed TypeScript
   writer, then run the owning reconcile/import command. Validate metadata,
   links, preconditions, and every returned receipt before applying writes.
5. **Guard and verify:** Run `/md-compress` begin/edit/finalize for changed
   Markdown, validate OKF and indexes, and return receipts. If evidence or
   authority fails, preserve the existing KB and stop.

### Fixed JSON request boundary

For reconciliation or capture JSON containing backticks, dollar signs, quotes,
or newlines, first run `mktemp` alone and retain the printed absolute path.
Create the source through the approved editor, then run this exact pipe with
the literal paths:

```text
cat <absolute-request-source-path> | bun <agents-root>/scripts/write-json.ts <absolute-json-output-path>
```

The writer receives exactly one absolute output-path argument under the actual
OS temporary directory, parses and formats JSON before writing, and rejects
malformed, relative, or out-of-directory paths. Never use a shell variable,
command substitution, heredoc, inline writer, Python, object-valued string
payload, or `JSON.stringify(request)`. Encode Markdown backticks and dollar
signs inside JSON as `\\u0060` and `\\u0024`.

### Reconciliation schema and dispositions

The request is the `ReconciliationPlan` contract: required top-level
`canonicalPath` (one operation path), `links` (possibly empty; endpoints and
body link markers must match), and non-empty `operations`. Each operation has
nonblank `body`, `disposition`, `evidence`, OKF `metadata`, and a valid
`relativePath`. The runtime rejects duplicate paths, invalid create/update
preconditions, more than one canonical owner, missing link endpoints, and
missing body markers; it cannot decide semantic equivalence for the caller.

The parser's typed fields remain explicit: `canonicalPath` is a `string`,
`links` is an `array` whose `from` and `to` values are operation paths, and
each operation's `metadata` contains `type`, `title`, `description`, and
`tags`. A declared body link uses the exact marker `](<to-relativePath>)`.
The writer's string-only fields include `content` and `write`; the runtime
reads the materialized request with `readText` and the implementation contract
is `utils/knowledge-base.ts`.

For a completed AIDX `plan`, use the plan importer rather than reconstructing
the concept body. The configured root may be
`~/Library/Application Support/agent-knowledge-base` or
`${XDG_DATA_HOME:-~/.local/share}/agent-knowledge-base`. Request files use the
actual `os.tmpdir()`; never guess `/tmp` or `/private/tmp`.

The plan importer parses YAML frontmatter with `gray-matter`. A request must
use the one exact `<absolute-json-output-path>` and the owning `write-json.ts`
writer; an empty link list is the literal `[]`.

The generic request shape is:

```json
{
  "canonicalPath": "<repo-search-index-or-shared>/<subject-a>/<concept-a>.md",
  "links": [
    {
      "from": "<repo-search-index-or-shared>/<subject-a>/<concept-a>.md",
      "to": "<repo-search-index-or-shared>/<subject-b>/<concept-b>.md"
    }
  ],
  "operations": [
    {
      "disposition": "new-primary",
      "relativePath": "<repo-search-index-or-shared>/<subject-a>/<concept-a>.md",
      "metadata": {
        "type": "<pattern|lesson|incident|reference|plan|preference|practice>",
        "title": "<concise title>",
        "description": "<one-line description for search discoverability>",
        "tags": ["<tag-one>", "<tag-two>"]
      },
      "body": "## Context\n\n<observed-situation>\n\n## Action\n\n<durable-fix>\n\n## Evidence\n\n- Source: <factual-source-path-or-event>\n- Verification: <observed-test-command-or-state>\n- Related concept: [Related concept](<repo-search-index-or-shared>/<subject-b>/<concept-b>.md).",
      "evidence": "<factual-capture-evidence-one-sentence>"
    }
  ]
}
```

The required writer pipe is:

```text
cat <absolute-request-source-path> | bun <agents-root>/scripts/write-json.ts <absolute-reconciliation-request-path>
```

The same pipe is the required reconciliation materialization:

```text
cat <absolute-request-source-path> | bun <agents-root>/scripts/write-json.ts <absolute-reconciliation-request-path>
```

The command arguments are `<private-kb-root>`, `<query>`, and
`<absolute-reconciliation-request-path>` as applicable; the lifecycle owner
is `reconcile`. The exact string-only writer action is
`cat <absolute-request-source-path> | bun <agents-root>/scripts/write-json.ts <absolute-reconciliation-request-path>`.

The path contracts remain explicit:

```text
<private-kb-root>/(<repo-search-index>|shared)/<subject>/<concept>.md
```

```text
shared/organization/<concept>.md
shared/team/<concept>.md
<repo-search-index>/<subject>/<concept>.md
```

Do not use `rg` as a private-KB authority, and do not use `/knowledge-base` or
`/repo-search` to bypass this skill's root/index ownership. Organization,
team, and project records retain their `ALWAYS`/`NEVER` precedence.

| Command or information | Arguments | When to use | Additional information |
| --- | --- | --- | --- |
| `import-plan` | `<relative-or-absolute-plan-path>` | A completed AIDX plan must become durable knowledge | `bun <agents-root>/scripts/knowledge-base.ts import-plan <relative-or-absolute-plan-path>`; the importer preserves the source and returns a receipt. AIDX may remove the source afterward when its retirement rule and user scope authorize it. |
| `related` | `<private-kb-root> <query>` | Before a distillation decision | `bun <agents-root>/scripts/knowledge-base.ts related "<private-kb-root>" "<query>"`; choose one explicit disposition. |
| `reconcile` | `<private-kb-root> <absolute-reconciliation-request-path>` | An approved multi-concept plan is complete | `bun <agents-root>/scripts/knowledge-base.ts reconcile "<private-kb-root>" "<absolute-reconciliation-request-path>"`; then guard every changed concept. |

### Search and batch retrieval

For one keyword search, use the combined command; it performs **repo-search discovery
first**, uses the staged fallback only when needed, resolves results through
validated OKF concepts, and returns every attempt as `found`, `not-found`,
`error`, or `skipped`:

The retrieval order is repo-search discovery first, then the validated staged fallback;
do not skip the authoritative index check.

```bash
bun <agents-root>/scripts/knowledge-base.ts search "<private-kb-root>" "<kb-repo-search-index>" "<query>"
```

For several independent terms use `search-batch` with one to four distinct
queries. Read the receipt and **do not rerun any listed command**. If the index
is unavailable or stale, use the staged fallback and ask the user to refresh
the named index; do not create another one.

## 6. Output & Completion Contract

Success returns validated concepts or receipts with exact root/index/source
evidence, updated parent indexes when authorized, and protected Markdown
validation. Plan import preserves the source and returns one durable write
receipt. A write is complete only after all preconditions, OKF checks, link
checks, index updates, and returned receipts pass.

Failure preserves existing knowledge and names the unavailable index, evidence
conflict, ownership ambiguity, rejected request, or compression/validation
failure. A matching search result, draft, or successful materialization alone
does not prove semantic correctness.

## 7. Evaluation Anchors

- **Canonical:** A read-only search returns validated OKF concepts, staged
  discovery attempts, and a machine receipt; an approved reconciliation writes
  one canonical owner and updates indexes.
- **Boundary:** A stale index, unverified draft, raw chat, invalid metadata,
  conflicting fact, or ambiguous owner is not used as authoritative knowledge.
- **Challenge:** A backtick-rich multi-concept request passes through the fixed
  writer pipe, declares exactly one canonical owner, and uses
  `new-primary`/`update-existing`/`link-related` without duplicating rules.
- **Independent verifier:** OKF validators, index checks, writer/parser
  receipts, link/precondition checks, and protected-token finalization verify
  the durable result.
