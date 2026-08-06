# AIDX knowledge map

These references support planning, design, implementation, security, quality,
and evidence. They are selectively loaded guidance, not mandatory process
steps.

Start with the [role knowledge map](roles/index.md) when a discipline changes
the decision. Use the smallest branch that supplies the required method or
proof; the role perspective remains the output contract.

- [aidx-principles.md](aidx-principles.md) — evidence, scope, compatibility,
  and proof principles.
- [audit-format.md](audit-format.md) — compact audit and evidence structure.
- [existing-codebase-change-guide.md](existing-codebase-change-guide.md) —
  safe changes to an existing system.
- [rules-reading.md](rules-reading.md) — instruction and ownership discovery.
- [software-engineering-work-packets.md](software-engineering-work-packets.md)
  — research, requirements, design, implementation, review, and validation
  records.
- [verification.md](verification.md) — acceptance-to-proof and final-gate
  discipline.
- [command-catalog.md](command-catalog.md) — deterministic command ownership,
  batching, and receipt conventions.
- [methodology-index-template.md](methodology-index-template.md) — guidance
  for maintaining selective maps in reusable reference folders.
- [languages/index.md](languages/index.md) — language and stack profiles.
- [roles/index.md](roles/index.md) — product, architecture, design,
  implementation, delivery, quality, and security references.

## Selective loading guide

Always-use baseline:

- [AIDX principles](aidx-principles.md) — smallest compatible change,
  evidence, and explicit boundaries.
- [Software-engineering work packets](software-engineering-work-packets.md) —
  requirement, source, proof, and review evidence.
- [Common engineering profile](languages/common.md) — shared code,
  trust-boundary, testing, and performance rules.

Select by decision:

- Requirements or user outcome: [requirements guide](roles/product/requirements-guide.md),
  [requirements elicitation](roles/product/requirements-elicitation.md), and
  [user-story patterns](roles/product/user-story-patterns.md).
- Product prioritization: [prioritization frameworks](roles/product/prioritization-frameworks.md).
- Architecture or boundary change: [architecture guide](roles/architect/architecture-guide.md),
  [architecture patterns](roles/architect/architecture-patterns.md),
  [DDD patterns](roles/architect/ddd-patterns.md), and
  [ADR template](roles/architect/adr-template.md).
- API or data model change: [API design guide](roles/developer/api-design-guide.md),
  [data modelling patterns](roles/developer/data-modelling-patterns.md), and
  [code analysis guide](roles/developer/code-analysis-guide.md).
- Implementation sequencing: [goal planning guide](roles/delivery/goal-planning-guide.md)
  and [implementation plan](../implementation-plan.md).
- UI or interaction change: [UX guide](roles/design/ux-guide.md),
  [interaction design patterns](roles/design/interaction-design-patterns.md),
  [wireframing guide](roles/design/wireframing-guide.md),
  [accessibility and WCAG](roles/design/accessibility-wcag.md), and
  [component specification template](roles/design/component-spec-template.md).
- Security or trust-boundary change: [security references](roles/security/index.md).
- Test strategy or reliability: [quality references](roles/quality/index.md).
- Existing-codebase discovery: [existing-codebase change guide](existing-codebase-change-guide.md)
  and `/codebase-memory`.
- Verification and audit evidence: [verification](verification.md) and
  [audit format](audit-format.md).

For an accepted UI direction, use `/frontend-design`; for React implementation,
use `/react`. These references inform the plan and do not create a second
workflow.
