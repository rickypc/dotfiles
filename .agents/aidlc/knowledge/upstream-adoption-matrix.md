# Upstream AIDLC adoption matrix

This is the historical comparison with `aidlc-workflows/dist/opencode/.aidlc`.
It records what the universal runtime retains, adapts, or omits. It does not
define current commands, route state, or policy; those have typed owners.

## Deliberate universal boundaries

- The route is 0.1–0.3; 1.1, 1.3, 1.4, 1.7; 2.1, 2.3, 2.5–2.8; and 3.1–3.3,
  3.5–3.6. Operation and a standalone Closure phase are excluded.
- Dynamic state is only `<agents-root>/aidlc/<cbm-index>/intents/<id>.md`.
  `aidlc/knowledge/` is committed methodology, never private KB content.
- Intents use `gray-matter`; `/knowledge-base` owns durable private knowledge;
  `/codebase-memory` owns code discovery; `utils/aidlc/stages.ts` owns route.
- Universal scripts and utilities replace upstream custom tools. Adapters expose
  one common packet to Claude Code, Codex, Kiro IDE, OpenCode, and VS Code.

## Roles

| Upstream role | Decision | Universal destination | Reason |
| --- | --- | --- | --- |
| architect | Adapt | `aidlc/roles/architect.md` and architect knowledge | Selected design stages remain. |
| delivery | Adapt | `aidlc/roles/delivery.md` and delivery knowledge | Approval and delivery planning remain. |
| design | Adapt | `aidlc/roles/design.md` and design knowledge | Used only for conditional UI work. |
| developer | Adapt | `aidlc/roles/developer.md` and developer knowledge | CBM-mediated research and implementation remain. |
| devsecops | Adapt as security | `aidlc/roles/security.md` and security knowledge | Security remains within NFRs and final validation. |
| product | Adapt | `aidlc/roles/product.md` and product knowledge | Intent, scope, and requirements remain. |
| quality | Adapt | `aidlc/roles/quality.md` and quality knowledge | Acceptance proof and final receipt remain. |
| reviewer / product lead | Fold in | Role review guidance | Separate native dispatch is not portable. |
| AWS / compliance / pipeline deploy | Fold in | Architect and security methodology | Useful constraints remain; operation ownership does not. |
| composer / operations | Omit | none | Engine authoring and Operation are out of scope. |

## Stages and prompts

| Upstream family | Decision | Universal destination |
| --- | --- | --- |
| Selected Initialization, Ideation, Inception, and Construction stages | Adapt | `aidlc/prompts/stages/<phase>/<stage>.md` |
| Rough mockups, market research, team formation, practices discovery, user stories, infrastructure design, CI pipeline | Omit as stages | Useful questions fold into selected stage contracts when material. |
| All Operation stages | Omit | none |

The prompt tree explains how to perform selected work. It cannot add a stage,
dependency, approval boundary, or lifecycle transition.

## Knowledge and sensors

| Upstream family | Decision | Universal destination |
| --- | --- | --- |
| Architect, developer, design, product, delivery, quality, devsecops guides | Adopt or adapt | `aidlc/knowledge/roles/<role>/` |
| Shared principles, brownfield, rules, verification | Adapt | `aidlc/knowledge/shared/` |
| Private memory, active-space state, worktree templates | Replace or omit | Temporary intent plus external /knowledge-base |
| Intent/context/approval/validation sensors | Adapt | Prompt contracts plus typed sensor utility |
| Claim-source, linter, type-check, and upstream-coverage sensors | Omit | They were duplicate non-executable surfaces. |

## Engine surfaces

| Upstream family | Decision | Universal destination |
| --- | --- | --- |
| Conductor and stage protocols | Adapt | `aidlc/conductor.md` and `aidlc/protocols/` |
| Runtime state / active spaces | Replace | typed intent lifecycle and runtime protocol |
| Scopes | Omit | Typed route plus factual conditional skips replaces a second router. |
| Hooks | Replace or omit | Lifecycle, context, and sensor scripts replace deterministic hooks; native hooks remain adapter-specific. |
| Custom tools and data graphs | Replace or omit | `scripts/`, `utils/`, and typed stages replace selected behavior. |
| OpenCode agents / commands | Adapt at edge | Adapter renders a common packet; no second workflow exists. |

## Adoption verification

The runtime is complete only when selected packet assets exist and are nonempty,
only valid CBM indexes may own intent paths, malformed frontmatter returns an
actionable error, and one configured final-gate receipt precedes explicit KB
closeout and retirement. Those checks belong to the typed runtime tests.
