# Upstream AIDLC adoption matrix

This file is the reviewable contract for the machine-wide runtime. It records
every artifact family in `aidlc-workflows/dist/opencode/.aidlc`, its fate, and
the reason. “Adopt” means retain the knowledge or behavior; “adapt” means put
the retained behavior behind the universal runtime; “omit” means deliberately
outside the four-phase route. It is not a promise to preserve an OpenCode path,
state engine, custom tool, or assistant-specific lifecycle.

## Runtime rules that govern every decision

- The selected route is only 0.1–0.3, 1.1/1.3/1.4/1.7,
  2.1/2.3/2.5/2.6/2.7/2.8, and 3.1/3.2/3.3/3.5/3.6. There is no Operation
  phase or separate Closure phase.
- Dynamic state is only `aidlc/<validated-cbm-index>/intents/<id>.md`.
  `aidlc/knowledge/` is committed workflow knowledge; it never holds private
  KB content.
- All dynamic intent Markdown is read and written with `gray-matter`.
- `knowledge-base` owns persistent private KB retrieval/capture.
  `codebase-memory` owns code search. The universal runtime never recreates
  either system.
- A project may set one `aidlc.config.json` `finalGate`; otherwise its one
  final command is `bun run test`.
- Assistant-native hooks and subagents never become a hidden universal
  dependency. The adapter presents the same scripts and packets to Claude
  Code, Codex, Kiro IDE, OpenCode, and VS Code.

## Agents

| Upstream role | Decision | Universal destination | Reason |
| --- | --- | --- | --- |
| architect | Adapt | `agents/aidlc/architect.md` + `knowledge/roles/architect/` | Leads retained design stages. |
| delivery | Adapt | `agents/aidlc/delivery.md` + `knowledge/roles/delivery/` | Owns approval and delivery sequencing. |
| design | Adapt | `agents/aidlc/design.md` + `knowledge/roles/design/` | Needed only for conditional 2.5 and UI design support. |
| developer | Adapt | `agents/aidlc/developer.md` + `knowledge/roles/developer/` | Owns CBM-mediated code research and implementation. |
| devsecops | Adapt as security | `agents/aidlc/security.md` + `knowledge/roles/security/` | Security is retained through NFRs, implementation, and the final gate. |
| product | Adapt | `agents/aidlc/product.md` + `knowledge/roles/product/` | Owns retained intent, scope, requirements. |
| quality | Adapt | `agents/aidlc/quality.md` + `knowledge/roles/quality/` | Owns test strategy and final-gate evidence. |
| architecture-reviewer, product-lead | Fold in | architect/product review checklists | Separate agent dispatch is not portable; adversarial review remains. |
| aws-platform, compliance, pipeline-deploy | Fold in | architecture/security knowledge | Their cloud, compliance, CI knowledge is useful, but their Operation-stage ownership is not selected. |
| composer | Omit | none | OpenCode composition/runtime authoring, not a project workflow role. |
| operations | Omit | none | Operation phase is explicitly excluded. |

## Stage contracts and prompts

All 18 selected upstream stage documents are adopted as substantive,
universal stage prompts at `prompts/aidlc/stages/<phase>/<stage>.md`.
The typed route remains in `utils/aidlc/stages.ts`; it is the executable
source of order and conditions. There is no duplicate `aidlc/stages/` prompt
tree that can drift from the executable packet.

| Upstream family | Decision | Destination |
| --- | --- | --- |
| initialization: workspace-scaffold, workspace-detection, state-init | Adapt | matching Initialization prompts |
| ideation: intent-capture, feasibility, scope-definition, approval-handoff | Adapt | matching Ideation prompts |
| inception: reverse-engineering, requirements-analysis, refined-mockups, application-design, units-generation, delivery-planning | Adapt | matching Inception prompts; 2.5 is deterministic non-UI skip |
| construction: functional-design, nfr-requirements, nfr-design, code-generation, build-and-test | Adapt | matching Construction prompts; 3.6 invokes only the configured gate |
| market-research, rough-mockups, team-formation, practices-discovery, user-stories, infrastructure-design, ci-pipeline | Omit as stages | Their useful questions are folded into retained intent/scope/requirements/design/NFR contracts; no ceremonial stage is emitted. |
| all Operation stages | Omit | none | Explicitly outside the route. |

## Conductor and protocols

| Upstream artifact | Decision | Universal destination |
| --- | --- | --- |
| `aidlc-common/conductor.md` | Adapt | `aidlc/conductor.md` |
| stage-protocol.md | Adapt | `aidlc/protocols/stage-protocol.md` |
| stage-definition.md | Adapt | `aidlc/protocols/stage-definition.md` |
| stage-protocol-governance.md | Adapt | `aidlc/protocols/stage-protocol-governance.md` |
| stage-protocol-recovery.md | Adapt | `aidlc/protocols/stage-protocol-recovery.md` |
| runtime-specific state and active-space conventions | Replace | `aidlc/protocols/runtime.md` and typed intent lifecycle |

The adapted documents retain evidence, questions, decision ownership, review,
recovery, and provenance. They intentionally remove `aidlc/spaces`,
`.aidlc/tools`, `Task*`, subagent dispatch, worktrees, and upstream state
files.

## Knowledge

The upstream role and shared knowledge is adopted as committed **methodology**,
not copied private memory. Each retained guide is present under
`aidlc/knowledge/roles/` or `aidlc/knowledge/shared/`, and stage prompts load
only the small relevant set in their packet.

| Upstream knowledge group | Decision | Notes |
| --- | --- | --- |
| architect: ADR, architecture guide/patterns, DDD, NFR guide/patterns | Adopt | All six retained. |
| developer: API, code analysis/generation/patterns, data modelling, RE artifacts | Adopt | All six retained; CBM search authority is substituted for raw scanning. |
| design: WCAG, component spec, interaction patterns, UX, wireframing | Adopt | All five retained for UI work. |
| product: functional design, research, prioritization, product, elicitation/requirements/user stories | Adopt | Retained material supports the selected stages without creating user-story stage. |
| delivery: mob programming, team topology, workflow planning | Adapt | Planning material retained; no mandatory mob or team-forming stage. |
| quality: reliability, validation, test strategy, testing | Adopt | Final gate remains a single project command. |
| devsecops: pipeline, NFR, security, STRIDE | Adapt | Security guidance retained; no deployment pipeline stage. |
| shared: principles, audit, brownfield, rules, verification | Adapt | Rewritten for one temporary intent and external KB. |
| shared memory/state/worktree templates | Replace or omit | Intent frontmatter and scripts replace state; private KB replaces memory; no worktree runtime. |
| AWS, compliance, operations, pipeline deploy | Selectively fold | Cloud/compliance/CI design considerations go to architecture/security; operation-only guidance is omitted. |
| composer/reviewer role guides | Fold in | Conductor review and approval contracts replace assistant-specific dispatch. |

## Scope, sensor, skill, hook, and data surfaces

| Upstream family | Decision | Universal destination |
| --- | --- | --- |
| all scopes | Omit | The typed 18-stage route and factual conditional skips replace a second scope-routing surface. |
| sensors: intent evidence, context snapshot, approval gate, validation evidence | Adapt | `prompts/aidlc/sensors/` documents the live contracts; `utils/aidlc/sensors.ts` executes them. |
| sensors: claim-sources, required-sections, upstream-coverage, linter, type-check | Omit | They were duplicate, non-executable surfaces. Source provenance and final-gate semantics are covered by the live sensor contracts and protocol. |
| skills: root aidlc | Adapt | `skills/aidlc/` remains the route entry point |
| skills: bugfix/feature/refactor/security-patch | Adapt | thin scope entry points, all backed by one engine |
| skills: selected retained-stage runners | Adapt | thin stage entry points only when a user explicitly invokes a stage |
| skills: compose/replay/outcomes/session-cost and all unselected stage skills | Omit | Runtime/analytics or stage surface not selected. |
| hooks: audit, transition guard, validate state, sensor fire | Replace | intent lifecycle and `scripts/aidlc/{stage,sensors}.ts` own these deterministically |
| hooks: session/start/end/statusline/stop/log-subagent/mint/reviewer/runtime compile/sync | Omit or adapter-only | Native lifecycle UI and subagent mechanics are assistant-specific, never universal hooks. |
| tools: state, orchestrate, runtime, validate, sensor implementations | Replace | `scripts/aidlc.ts` and `utils/aidlc/` |
| tools: audit/log/directive/graph/includes/jump/learnings/swarm/worktree/version | Omit | Upstream engine-specific or nonessential to selected route. |
| data: scope-grid, stage-graph | Adapt as typed source | `utils/aidlc/stages.ts` and scopes are the executable definition. |
| data: ARS priors, harness, memory seed | Omit | No hidden priors; harness is project test suite; KB owns memory. |

## Adapter comparison

The upstream `.aidlc/agents` and `.opencode/agents` carry the same role
bodies with different adapter metadata (`disallowedTools` versus OpenCode
`mode` and permissions). The universal runtime keeps one rich role card
without either metadata. Adapters convert that common packet to a handoff for
each supported assistant. The upstream `.opencode/command/aidlc.md` is a thin
command adapter that invokes the actual skill; it is not a second workflow
implementation.

## Completion tests

The migration is incomplete unless the test suite proves: all selected prompt,
role, protocol, knowledge, scope, and sensor assets exist and are nonempty;
packets point at the substantive prompt tree; duplicate active intent IDs do
not overwrite state; only listed CBM indexes are accepted; malformed Markdown
returns an actionable error; and an end-to-end intent records one successful
configured final-gate receipt before retirement.
