# Universal stage-definition contract

The executable route is `utils/aidlc/stages.ts`. It is the only
authority for phase, number, order, condition, roles, sensors, and approval.
Markdown stage files explain how to perform work; they cannot declare a new
stage, create a dependency on an omitted stage, or alter execution state.

## Selected route

| Phase | Selected stages |
| --- | --- |
| Initialization | 0.1 Workspace Scaffold; 0.2 Workspace Detection; 0.3 State Initialization |
| Ideation | 1.1 Intent Capture; 1.3 Feasibility; 1.4 Scope Definition; 1.7 Approval & Handoff |
| Inception | 2.1 Reverse Engineering; 2.3 Requirements Analysis; 2.5 Refined Mockups; 2.6 Application Design; 2.7 Units Generation; 2.8 Delivery Planning |
| Construction | 3.1 Functional Design; 3.2 NFR Requirements; 3.3 NFR Design; 3.5 Code Generation; 3.6 Build and Test |

Operation is excluded. Successful 3.6 hands reusable lessons to
`knowledge-base` and retires the central intent; it is not a fifth phase.

## Prompt-file metadata

Each selected stage prompt has small gray-matter metadata: `stage`, `number`,
`phase`, `condition`, and `route_authority`. It is descriptive and must agree
with the typed route. There are deliberately no metadata fields for native
agents, sub-agent modes, generated state graphs, per-stage artifact roots,
hooks, or tool locations. Universal executables are under `<agents-root>/scripts/`;
reusable implementation code is under `<agents-root>/utils/`.

## Stage outcomes

A selected stage is exactly one of pending, active, completed, skipped, or
awaiting approval. Completion requires evidence. Skip requires a factual
inapplicability reason. Approval is meaningful only at 1.7 and must be
persisted through the lifecycle script. A skip advances the route; it does not
create a blocker, an omitted artifact, or a hidden prerequisite.

The central intent is the only temporary workflow record:
`<agents-root>/aidlc/<cbm-index>/intents/<intent-id>.md`. Its CBM index must be a
project name returned by `codebase-memory`, never a filesystem path or a slug.
Lifecycle frontmatter uses `gray-matter` exclusively and is never hand-edited.
