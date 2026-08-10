# Engineering planning contract

This reference is owned by `/aidp`. It carries the reusable engineering,
language, role, UI, quality, security, brownfield, and delivery guidance that
the planner needs after the retired lifecycle tree is removed. It contains no
runtime dependency on that tree.

## Evidence and records

Use this authority order: current user request; applicable project
instructions; verified repository and file evidence; validated private
knowledge; labelled assumptions. A missing result is unknown, not permission
to invent a fact. For brownfield work, capture current behavior, entry path,
owner, consumers, data/protocol boundaries, existing proof, compatibility,
and uncertainty.

Build one compact evidence set before decomposition:

- Research record: sources read, observed facts, unknowns, and search limits.
- Requirements record: actor/trigger, outcome, success and failure behavior,
  preserved behavior, exclusions, constraints, dependencies, and one proof per
  acceptance item.
- Design record: current extension point, ownership, interfaces, data flow,
  alternatives, reversibility, NFR/security impact, and migration/rollback.
- Units record: smallest independently testable units, dependency order,
  owner, acceptance mapping, and completion proof.
- Delivery record: sequence rationale, risks, assumptions, final gate, and
  re-plan triggers.

Every executable workflow step must be authored as an unchecked Markdown task
item (`- [ ]`). This is the shared state handed to `/aidx`; AIDP never marks a
step complete.

Before asking a clarification question, retrieve repository context through
`/repo-search` and private context through `/knowledge-base`, then record both
receipts and the resulting facts, limits, decisions, and unknowns. Ask one
decision-relevant question at a time. If an answer changes a target, owner,
scope, behavior, dependency, safety, architecture, or proof strategy, refresh
the affected context and continue the clarification loop. Do not infer a
default or write a plan while any material ambiguity remains.

The request may be only an incomplete sentence. Treat it as a hypothesis to
expand, not as a complete specification. The command options and arguments
for building the evidence set are owned by `SKILL.md`; this reference supplies
the planning obligations and interpretation rules only.

The protected command-contract tokens remain `<approved-root>`, `<query>`,
`<absolute-jsonl-request-path-under-os-tempdir>`, `<private-kb-root>`, and
`<repo-search-index>`. The canonical command strings remain
`bun <agents-root>/scripts/repo-search.ts "<approved-root>" "<query>"`,
`bun <agents-root>/scripts/repo-search.ts inspect "<approved-root>" "<absolute-jsonl-request-path-under-os-tempdir>"`,
and `bun <agents-root>/scripts/knowledge-base.ts search "<private-kb-root>" "<repo-search-index>" "<query>"`;
their caller-facing options table is maintained only in `SKILL.md`.

Ask one focused question only when its answer changes scope, behavior, safety,
ownership, architecture, or verification. State what decision it unlocks and
the smallest consequence of each answer. Do not infer layout, framework,
compliance, or preserved behavior from a screenshot or plausible convention.

## Common engineering rules

- Prefer the smallest compatible change and an existing extension point.
- Keep responsibilities cohesive, dependencies directional, public contracts
  narrow, data flow explicit, and side effects visible at boundaries.
- Validate untrusted input at ingress; keep validation separate from
  authorization; protect secrets and use parameterized data access.
- Test behavior at the smallest useful boundary, then use integration or
  browser proof where persistence, protocols, or critical user journeys need
  it. A coverage number never substitutes for mapped acceptance proof.
- A performance claim names the path, observation or measurement, baseline or
  limit, and trade-off. A security, reliability, or performance discovery that
  changes scope or proof is a re-plan trigger.

## Observed-language routing

Read the common rules first. Select only profiles supported by repository
evidence; never route from a guessed extension. Combine the selected profile
with project instructions and the configured final gate.

| Observed language or surface | Planning obligations | Proof emphasis |
|---|---|---|
| C# | Preserve handler/service/repository seams; make nullability, cancellation, disposal, binding, serialization, and authorization explicit. | Validation, missing/forbidden resource, cancellation, persistence, contract. |
| Go | Preserve small consumer-owned interfaces; propagate context and deadlines; check contextual errors; inspect goroutine, channel, race, and cleanup ownership. | Table-driven boundary cases plus race/concurrency proof when affected. |
| Java | Preserve controller/service/repository/module boundaries; make nullability, exception translation, transactions, retries, idempotency, and DTO/schema compatibility explicit. | Unit, integration, persistence, response, and failure behavior. |
| PHP | Follow the project typing/error model; keep actions focused; validate identifiers; preserve model/query boundaries; inspect policy, tenant scope, uploads, queues, and transactions. | Existing PHPUnit/framework conventions, including invalid and forbidden requests. |
| Python | Preserve type, mutability, exception, async, schema, and persistence conventions; avoid blocking async paths and mutable defaults. | Success, validation, permission, error, async, and persistence cases. |
| React Native | Treat navigation, permissions, lifecycle, offline behavior, platform divergence, touch targets, focus, and device resources as behavior. | Component/device/browser-owned user-path proof and platform differences. |
| React | Keep state with its narrowest owner; preserve routing/data/cache conventions; specify loading, empty, error, retry, keyboard, focus, semantic, and responsive states. | User-visible outcomes at existing component/integration/browser boundaries. |
| Rust | Model ownership, borrowing, error variants, invariants, unsafe scope, task lifetime, locking, and cancellation explicitly. | Parsing, serialization, error variants, public API, and concurrency. |
| TypeScript | Separate static types from runtime validation; avoid unsafe casts; preserve async/resource/config contracts and exported types. | Runtime behavior plus type-sensitive edge cases. |
| Web/HTML/CSS | Start with semantic HTML; specify keyboard/focus, labels, contrast, responsive, reduced motion, loading/empty/error states, safe sinks, and browser boundaries. | Existing browser/accessibility capability and named user journey. |

## Role routing

Use only roles relevant to the request. Roles provide perspective, not extra
scope or a second workflow.

| Role | Invoke when | Required contribution |
|---|---|---|
| Product | Intent or scope is incomplete. | Separate requested, preserved, constrained, assumed, and excluded behavior; make acceptance observable. |
| Architect | Boundaries, interfaces, data ownership, compatibility, or material trade-offs change. | Smallest design, alternatives, reversibility, dependencies, NFRs, migration/rollback. |
| Developer | Implementation units need definition. | Reuse conventions, map call chain/change surface, preserve public signatures, and avoid unrelated cleanup. |
| Quality | Acceptance or final verification is at risk. | Acceptance-to-proof matrix, success/failure/boundary cases, final-gate distinction, limitations. |
| Security | Trust, secrets, permissions, external inputs, data handling, or supply chain is in scope. | Concrete boundaries, controls, and proof; state inapplicability when evidence supports it. |
| Design | The request changes a user-facing experience. | Flow, visible states, responsive behavior, semantic/accessibility obligations, and browser proof. |
| Delivery | Multiple units, dependencies, risks, or sequencing decisions exist. | Approval-ready handoff, dependency/risk/value order, completion proof, and re-plan triggers. |

## UI, NFR, and delivery gates

For UI work, capture primary user/job, hierarchy, density, viewport rules,
navigation, interaction ownership, loading/empty/partial/error/retry/success/
disabled/stale states, accessibility, visual language, preserved behavior, and
measurement evidence before comparing alternatives. Prefer native semantics,
visible focus, labels, non-color cues, keyboard operation, responsive behavior,
and reduced-motion support.

For NFR work, name only evidenced categories: performance, security,
scalability, reliability, observability, privacy, maintainability, or
operability. Each material category needs a constraint, owner, implementation
implication, and proof. Do not invent numeric targets.

For delivery, choose a proportionate unit count. Sequence by dependency, risk
reduction, value, or test isolation; record the rationale. Every unit maps to
acceptance and a completion proof. A changed owner, dependency, boundary,
requirement, risk, or proof strategy requires re-planning.

## Source migration map

The following source families were reviewed and their reusable contracts are
represented above: `knowledge/languages/common.md` and `profiles.md`; role
guidance for architect, developer, product, quality, security, design, and
delivery; shared guidance for principles, brownfield discovery, rules reading,
software-engineering work packets, verification, and upstream adoption; and
stage material covering intent capture, scope, feasibility, reverse
engineering, requirements, UI definition, code generation, NFRs, workspace
state, and recovery. Runtime scripts, lifecycle frontmatter, duplicated stage
machinery, and implementation-specific examples are intentionally not copied
because this skill owns planning contracts, not execution infrastructure.
