---
stage: state-init
number: "0.3"
phase: initialization
condition: "always"
route_authority: "<agents-root>/utils/aidlc/stages.ts"
---

# 0.3 State Initialization

This stage is automatic inside `aidlc.ts start`. It creates the selected
four-phase route from `utils/aidlc/stages.ts`, records UI applicability from
the explicit `--ui` flag, and completes 0.1–0.3 in the intent ledger in one
response. The returned packet is therefore immediately for 1.1 Intent Capture.

The route has exactly the selected 18 stages. Refined Mockups (2.5) is marked
skipped only when `ui_required: false`; every other conditional stage remains
available for evidence-based completion or factual skip. Do not add a scope
grid, stage graph, phase directory, or state file. Do not classify a project
as greenfield or brownfield from its parent path—2.1 performs bounded
codebase-memory research when brownfield context is needed.

The lifecycle, route ledger, audit trail, approval state, and KB bindings are
stored only in the central intent's gray-matter frontmatter and body, using the
lifecycle script. A malformed intent must produce the actionable AIDLC
frontmatter error; it must not cause opaque YAML exceptions or a guessed route.

The evidence states that the selected route and UI flag were recorded. No user
question or approval applies; `start` returns the 1.1 packet.
