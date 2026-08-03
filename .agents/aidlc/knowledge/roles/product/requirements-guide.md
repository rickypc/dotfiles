# Requirements Guide

## Requirement Types

### Functional Requirements (FR)
Define what the system must do. Format: "The system shall [verb] [object] [condition]."
- User-facing behavior (inputs, outputs, interactions)
- Business rules and logic (calculations, validations, state transitions)
- Data requirements (entities, relationships, lifecycle)
- Integration requirements (external systems, APIs, data feeds)

### Non-Functional Requirements (NFR)
Define how the system must perform. Must be quantifiable.
- **Performance**: Response time < Xms for Y% of requests under Z concurrent users
- **Availability**: X% uptime measured over a rolling 30-day window
- **Scalability**: Support X to Y concurrent users with linear resource scaling
- **Security**: Authentication method, authorization model, data encryption at rest/in transit
- **Usability**: WCAG level, maximum clicks to complete core workflow
- **Maintainability**: Code coverage target, deployment frequency target

### Constraints
Non-negotiable boundaries imposed externally:
- Technology mandates (must use AWS, must use React, must support IE11)
- Regulatory compliance (GDPR, HIPAA, SOC2, PCI-DSS)
- Budget and timeline limitations
- Integration compatibility with existing systems

### Assumptions
Believed-true conditions that have not been validated:
- Always document assumptions explicitly
- Assign an owner responsible for validating each assumption
- Track assumption status (unvalidated, confirmed, invalidated)

## Elicitation Techniques

Use these in order of preference for AI-DLC:
1. **Document analysis** -- Read existing docs, READMEs, wikis, API specs, database schemas
2. **Structured questioning** -- Ask targeted questions using the completeness checklist below
3. **Scenario walkthrough** -- Walk through key user journeys step by step
4. **Constraint identification** -- Ask "What must NOT happen?" and "What are the limits?"
5. **Edge case probing** -- For each requirement, ask "What happens when [unusual condition]?"

### UI requirement elicitation

For a user-facing screen or journey, route layout discovery through the
[UI intent completeness matrix](../design/interaction-design-patterns.md#ui-intent-completeness-before-design-comparison)
before asking for or evaluating visual alternatives. Capture the primary job,
information hierarchy, content density, viewport and responsive behavior,
persistent context, interaction ownership, state coverage, accessibility,
visual language, preserve/change boundaries, and comparison evidence. If a
material answer is absent, ask focused questions before design work; do not
turn a screenshot or an implementation preference into an unstated
requirement.

## Acceptance Criteria Pattern

Use plain observable condition, action, and outcome language:
```
Condition: [precondition or initial state]
Action: [user action or trigger]
Outcome: [observable expected result]
```

Each requirement should have:
- At least 1 happy-path scenario
- At least 1 error/edge-case scenario
- Boundary values for any numeric constraints

## Completeness Analysis Checklist

For every system, verify coverage of:
- [ ] User authentication and authorization
- [ ] Data input validation and sanitization
- [ ] Error handling and user-facing error messages
- [ ] Data persistence and retrieval (CRUD for each entity)
- [ ] Search and filtering capabilities
- [ ] Pagination for list views
- [ ] Audit logging for sensitive operations
- [ ] Notification/alerting requirements
- [ ] Data export/import capabilities
- [ ] Concurrent access and conflict resolution
- [ ] Session management and timeout behavior
- [ ] Offline/degraded mode behavior (if applicable)
- [ ] Localization and internationalization (if applicable)
- [ ] Accessibility requirements
- [ ] Data retention and deletion policies

## Traceability Matrix Format

```
| Req ID | Description | Priority | Status | Design Ref | Unit Ref | Test Ref |
|--------|-------------|----------|--------|------------|----------|----------|
| FR-001 | [summary]   | Must     | Approved | AD-003   | U-007    | TC-012   |
```

Every cell should be filled. Empty cells indicate gaps:
- Empty Design Ref: requirement not yet designed
- Empty Unit Ref: requirement not yet assigned for implementation
- Empty Test Ref: requirement not yet covered by test plan
