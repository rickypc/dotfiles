---
name: knowledge-base
description: Retrieve, capture, validate, and distill persistent OKF knowledge.
---

# Knowledge Base

Persistent KB data is outside `~/.agents` at
`~/Library/Application Support/agent-knowledge-base`. Store only validated,
durable knowledge. Never store raw chat, secrets, speculation, or a log.

Concept paths must match
`^(<cbm-index>|shared)/<subject>/<concept>\.md$`. Each KB root and subject
directory has an `index.md`; concepts use Markdown frontmatter with required
`type`, `title`, `description`, and `tags`.

Retrieve project, organization, team, policy, or prior-decision knowledge only
when it materially informs the work. Capture a lesson only with observed
symptom, cause, durable fix, and evidence. Use `codebase-memory` only to speed
discovery when its KB-root index is ready. After a concept update, invoke
`md-compress`, then validate OKF structure and protected content.

Use the KB at the point it can change a decision: before research when relevant
knowledge exists, after validation for durable results, or immediately for an
explicit capture. Resolve the correct `<cbm-index>` or `shared` scope before
writing. Do not create a new concept when a matching concept can be safely
updated. A new or updated concept must include source and verification evidence
in its body, then its parent `index.md` must list it.

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

Use `codebase-memory` only for read discovery of the KB root. It does not
replace the KB indexes or authorize writing.

For one KB keyword search, invoke the combined search command. It performs
CBM discovery first, uses the shared staged `rg` fallback only when needed,
then resolves results through validated OKF concepts. Its receipt states every
CBM and `rg` attempt as `found`, `not-found`, `error`, or `skipped`. Read that
receipt and do not rerun any listed command.

```bash
bun ~/.agents/scripts/knowledge-base.ts search "<private-kb-root>" "<kb-cbm-index>" "<query>"
```

For AIDLC practices, use only validated concept records in this resolver order:

```text
shared/organization/<concept>.md
shared/team/<concept>.md
<cbm-index>/project/<concept>.md
```

Use `~/.agents/aidlc/prompts/templates/practice-record.md` as the public
structure reference. The resolver rejects a matching `ALWAYS` / `NEVER` rule
conflict; do not create placeholder organization, team, or project records.
