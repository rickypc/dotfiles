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

Apply `aidlc/knowledge/shared/command-catalog.md` to derived command tables.
Any fixed reconciliation request is an absolute path under the operating system
temporary directory; the request is parsed by this runtime, never passed to an
external dependency as a raw payload.

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

One intent may contain several atomic lessons. Do not turn that fact into one
file per intent or duplicate the same rule in several files. First use the
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

For an approved non-AIDLC reconciliation, create one fixed reconciliation
request JSON file and invoke the deterministic command below. The request has
one `canonicalPath`, a non-empty `operations` array, and explicit links. Each
operation identifies its `disposition`, `relativePath`, complete `metadata`,
replacement `body`, and factual `evidence`. The runtime validates duplicate
paths, create/update preconditions, one canonical owner, and declared
bundle-relative Markdown links. It validates mechanical integrity; it cannot
prove semantic equivalence or decide ownership for the caller.

| Priority | When | Required inputs | Command | Result | Next |
| --- | --- | --- | --- | --- | --- |
| 1 | Find candidates before a distillation decision. | `<private-kb-root>`, `<query>` | `bun <agents-root>/scripts/knowledge-base.ts related "<private-kb-root>" "<query>"` | Validated concept candidates matching the supplied query. | Select one explicit disposition. |
| 2 | Apply an approved multi-concept reconciliation outside AIDLC. | `<private-kb-root>`, `<absolute-reconciliation-request-path>` | `bun <agents-root>/scripts/knowledge-base.ts reconcile "<private-kb-root>" "<absolute-reconciliation-request-path>"` | Deterministic new-primary, update-existing, and link-related writes plus index receipts. | Start the returned Markdown guard for every changed concept. |

Inside AIDLC, do not call `related` or `reconcile` directly. The AIDLC
closeout boundary owns the same fixed reconciliation request through its one
`capture-and-begin` action. It returns every guarded source path and its one
`finalize-and-recover` action; do not bypass that transaction with standalone
commands.

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

For AIDLC practices, use only validated concept records. Organization and team
records retain their precedence; project records may live under any subject:

```text
shared/organization/<concept>.md
shared/team/<concept>.md
<cbm-index>/<subject>/<concept>.md
```

Use `<agents-root>/aidlc/prompts/templates/practice-record.md` as the public
structure reference. The resolver rejects a matching `ALWAYS` / `NEVER` rule
conflict; do not create placeholder organization, team, or project records.
