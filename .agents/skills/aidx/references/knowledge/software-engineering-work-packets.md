# Software-engineering work packets

Use one packet section for the active AIDX state and write it in the goal
record or a project-owned artifact. These are planning and proof forms, not
additional states, approval gates, commands, or files that must be created for
every small change. Omit a field only with a factual `N/A` reason.

## Selection matrix

| Active work | Use this section | Record it where | Why it exists | Do not use it to |
| --- | --- | --- | --- | --- |
| Existing-code discovery | **Research record** | Goal **Inspection Evidence** | Make source facts, inference, risk, and gap traceable. | Invent a code map or broaden the affected system. |
| Requirements or clarification | **Requirements record** | Goal **Decisions and Exclusions** | Turn approved scope into observable, testable commitments. | Turn a preferred implementation into an approved requirement. |
| Architectural approach | **Application-design record** | Goal **Plan** or project ADR | Bind requirements to owners, interfaces, decisions, and reversibility. | Add infrastructure or a pattern without a demonstrated need. |
| Implementation decomposition | **Units record** | Goal **Plan** | Give each unit an owner boundary, dependency, change, and proof. | Split work merely to look parallel or exhaustive. |
| Implementation sequence | **Delivery record** | Goal **Plan** | State exact increment order, files/boundaries, rationale, validation, and re-plan triggers. | Reinterpret scope after the sole approval boundary. |
| Focused code review | **Review record** | Goal **Decisions and Exclusions** or project review artifact | Make findings reproducible and make a clean review explicit. | Manufacture findings, hide uncertainty, or use severity as rhetoric. |
| Final validation and closeout | **Validation record** | Goal **Validation** and final-gate receipt | Map acceptance to evidence and distinguish focused feedback from the final gate. | Replace the configured final gate with a generic runner. |

## Research record

| Field | Record |
| --- | --- |
| Question and selected project | What must be learned; CBM project/index and project root. |
| Evidence | Query/view, source file or symbol, observed fact, and conclusion it supports. |
| Current flow and boundary | Entry point, dependencies, public/data contract, consumer, and preserved behavior. |
| Existing proof | Relevant tests, checks, fixtures, or absence of them. |
| Inference and uncertainty | Clearly marked inference, missing evidence, and the smallest blocking question. |
| Risks | Compatibility, security, migration, performance, accessibility, or operational risk that is material. |

## Requirements record

For every material requirement, use:

| Field | Record |
| --- | --- |
| ID and priority | Stable identifier and priority only when prioritization changes delivery. |
| Source | User request, observed behavior, validated KB rule, or named assumption. |
| Actor and trigger | Who/what initiates the behavior and when. |
| Expected result | Observable success outcome and affected boundary. |
| Must not | Preserved behavior, excluded scope, compatibility, privacy, or safety constraint. |
| Failure/boundary case | Invalid input, unavailable dependency, empty state, authorization, limit, or rollback case as applicable. |
| Proof | Named test, smoke check, inspection, or final-gate evidence; identify proof not yet executable. |

## Application-design record

| Field | Record |
| --- | --- |
| Requirement coverage | Requirement IDs and the component/boundary that satisfies each. |
| Reuse before new work | Existing extension point or component; why reuse is sufficient or not. |
| Components and contracts | Responsibility, public interface/data shape, ownership, dependency direction, failure handling. |
| Decision | Context, chosen approach, consequences, alternatives rejected, reversibility, and migration/compatibility effect. |
| NFR effect | Security, reliability, performance, accessibility, privacy, or operational consequence when material. |
| Design gap | Explicit question or re-plan trigger; do not defer a decision to implementation by implication. |

## Units record

| Unit | Owns/changes | Depends on | Requirement IDs | Files or boundaries | Focused proof | Done when |
| --- | --- | --- | --- | --- | --- | --- |
| `<unit>` | `<responsibility>` | `<prerequisites>` | `<REQ-…>` | `<known targets or discovery boundary>` | `<test/smoke/inspection>` | `<observable outcome>` |

Keep units independently reviewable where the dependency graph permits. A unit
may name a discovery boundary when exact files are not yet known; it may not
silently expand into unrelated cleanup.

## Delivery record

| Increment | Units and requirements | Exact action and boundary | Why this order | Validation evidence | Risks/fallback | Re-plan trigger |
| --- | --- | --- | --- | --- | --- | --- |
| `<n>` | `<units / REQ IDs>` | `<modify/add/remove only what is approved>` | `<risk/value/dependency/thin-slice rationale>` | `<focused proof and final-gate relation>` | `<risk and recovery>` | `<fact that invalidates this plan>` |

The record must name each expected iteration in implementation order. For every
increment, say what will change, where it belongs, why it is next, how it will
be checked, and what fact would require returning to requirements or design.

## Review record

Use either `No findings` with the reviewed scope and checks, or one row per
finding:

| Finding | Exact location | Failure scenario | Surrounding context | Severity and rationale | Required correction or question | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| `<concise defect>` | `<file:symbol/line>` | `<how behavior fails>` | `<why it matters here>` | `<defensible impact>` | `<smallest safe action>` | `<proof after change>` |

A review comment is incomplete without a reproducible failure scenario and
context. Mark uncertain items as questions; never inflate severity or claim a
finding without evidence.

## Validation record

| Requirement or claim | Focused evidence | Result | Limitation or follow-up | Final-gate relation |
| --- | --- | --- | --- | --- |
| `<REQ/claim>` | `<test, smoke, review, inspection>` | `<pass/fail/not executable and why>` | `<known gap>` | `<covered by / separate from configured final gate>` |

Focused checks provide development feedback. Implementation and validation still run the
single configured project final gate and records its receipt. A passing gate is
not evidence for an acceptance item that has no mapped proof.

## Operating method

The records above are not forms to fill after implementation. Use this sequence
for any material software-engineering iteration:

1. State the request in one outcome sentence, then separate scope,
   non-goals, assumptions, and blocking decisions. A known implementation
   preference belongs in a decision, not in a requirement, until evidence
   supports it.
2. For an existing-codebase change, collect evidence before proposing a change. Every fact
   must name its query/source; every inference must name its basis; every
   unknown must either be non-blocking or become the smallest explicit question.
3. Convert the outcome into requirements with actor, trigger, expected result,
   preservation constraint, failure/boundary case, and proof. A requirement is
   incomplete if it cannot be observed or verified.
4. Select the smallest compatible design. Record existing extension points,
   owner boundaries, public/data contracts, alternatives considered, and why an
   added abstraction is justified. Do not make a design decision implicit in a
   file edit.
5. Decompose only after design: each unit owns one meaningful change, names its
   dependencies and proof, and points to a known file or a narrow discovery
   boundary. Keep the dependency graph acyclic; do not create units solely to
   simulate parallel work.
6. Order delivery increments deliberately. Each increment states the exact
   action, boundary, rationale, focused validation, risk/fallback, and the fact
   that would send work back to requirements or design. Implementation may not
   silently turn a new idea into scope.
7. Review the completed increment against the requirements and preserved
   behavior. A finding is actionable only when a reader can reproduce its
   failure scenario from the location and context. A clean review is a valid
   result when it names the reviewed scope and evidence.
8. Record proof per requirement, mark whether each proof is covered by the
   project-owned final gate, and run that gate once at the AIDX validation
   boundary. Do not execute a covered focused test separately. Leave
   limitations open rather than treating a green gate as evidence for an
   untested claim.

## Requirement and acceptance discipline

- Prefer behavior language: `when <trigger>, <actor> can <outcome>` over a
  class, endpoint, library, or storage choice.
- Keep the four distinctions visible: requested behavior, existing fact,
  approved decision, and unverified assumption. Do not collapse them into a
  persuasive narrative.
- Include negative acceptance explicitly: what must remain unchanged, what is
  excluded, which data/permission boundary must not widen, and what failure is
  safe and observable.
- A proof can be a focused automated test, contract test, integration test,
  browser/user-path check, or a precise manual observation when automation is
  not the right boundary. It must say what result would fail the criterion.

## Design and delivery discipline

- Reuse project patterns only after confirming they fit the changed contract;
  familiarity alone is not evidence. When no reusable extension point exists,
  explain the new boundary and its consumers.
- Treat persistence, protocol, serialization, authorization, and public types
  as compatibility surfaces. Identify conversion/migration/rollback behavior
  before implementation when one can change.
- Make ordering a decision: dependency-first protects prerequisites,
  risk-first surfaces uncertainty, value-first proves a user outcome, and a
  thin slice proves an end-to-end path. Name the chosen rationale.
- Re-plan when discovered facts invalidate a requirement, boundary, ownership,
  dependency, risk assumption, or validation strategy. A re-plan records what
  changed and does not retroactively rewrite earlier evidence.

## Review and validation discipline

| Severity | Use when | Required response |
| --- | --- | --- |
| Critical | Credible data loss, security breach, authorization bypass, corruption, or production outage risk. | Block handoff; correct and prove the fix. |
| High | A likely incorrect result, contract break, reliability failure, or severe maintainability issue on a normal path. | Correct before handoff unless the user explicitly accepts the risk. |
| Medium | A bounded correctness, resilience, testability, or maintainability concern with a concrete future cost. | Record a correction or a deliberate follow-up. |
| Low | A non-blocking clarity or local-consistency improvement. | Offer as a clearly optional suggestion. |

Never assign severity from wording alone. The scenario, affected consumer, and
impact must support it. Validation should use deterministic evidence whenever
possible; qualitative review is complementary, never a replacement for the
configured project final gate.
