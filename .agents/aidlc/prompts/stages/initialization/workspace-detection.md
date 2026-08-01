---
stage: workspace-detection
number: "0.2"
phase: initialization
condition: "always"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 0.2 Workspace Detection

This stage is automatic inside `aidlc.ts prepare`. It binds the intent to the
absolute selected project root and resolves one final-gate command. The project
may declare exactly one string property in `<project-root>/aidlc.config.json`:

```json
{ "finalGate": "go test ./..." }
```

When no valid project configuration is present, the resolved command is
`bun run test`. The result is recorded in the prepare packet so the assistant
does not need a second tooling turn merely to discover the gate. The universal
runtime does not infer a language, framework, repository relationship, or
additional validation command from path layout.

For any later brownfield research, project facts are established through the
`codebase-memory` skill. Projects sharing a home-directory prefix are separate
repositories unless their own evidence says otherwise; separately indexed
projects remain independent even when one path is excluded from another index.

The stage evidence identifies the absolute project root and resolved one final
gate. No user question or approval applies. `prepare` continues directly to
0.3.
