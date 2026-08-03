---
stage: workspace-scaffold
number: "0.1"
phase: initialization
condition: "always"
route_authority: "<agents-root>/utils/aidlc/stages.ts"
---

# 0.1 Workspace Scaffold

This stage is automatic inside `aidlc.ts start`; it exists as an auditable
contract, not as a request to create an upstream workspace tree. `start`
validates the named CBM project, derives the deterministic central intent path,
checks collision and frontmatter validity, and creates one gray-matter intent.

The only transient record is
`<agents-root>/aidlc/<cbm-index>/intents/<intent-id>.md`. Do not create project
folders, stage artifact directories, local knowledge stores, hooks, tools, or
assistant-native state. Committed methodology already lives under
`<agents-root>/aidlc/knowledge`; persistent private knowledge remains owned by
`/knowledge-base`.

The evidence recorded for this stage must state that the CBM project was
validated, the temporary intent path was created without overwriting an active
intent, and the route will be initialized by the universal typed definition.
No user question or approval applies. `start` continues directly to 0.2.
