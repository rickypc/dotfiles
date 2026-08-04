---
stage: application-design
number: "2.6"
phase: inception
condition: "always"
route_authority: "<agents-root>/utils/aidlc/stages.ts"
---

# 2.6 Application Design

Design the approach before implementation units are generated. Use product,
architect, and design perspectives returned by the packet. Add platform or
compliance analysis only when it is material to the approved requirements.

Path basis: the shortened `languages/...` names below resolve from
`<agents-root>/aidlc/knowledge`; the explicit `aidlc/...` path resolves from
`<agents-root>`.

## Design method

1. Read requirements, Reverse Engineering evidence when brownfield, and the UI
   definition when present. Identify existing components that can be reused and
   boundaries that must remain compatible.
2. Define components or modules, responsibilities, public interfaces, data
   ownership, communication paths, dependencies, error handling, and material
   NFR consequences.
3. Establish domain language and test the design against concrete scenarios,
   including material edge cases. Cross-check the proposed terms, boundaries,
   and invariants against verified code and documents; record contradictions as
   design gaps rather than resolving them by preference.
4. Compare viable architectural alternatives where a decision has meaningful
   trade-offs. Record context, decision, consequences, rejected alternatives,
   and reversibility in an ADR-style entry in the central intent.
   For user-facing alternatives, use the centralized [design comparison and
   selection protocol](../../../knowledge/roles/design/interaction-design-patterns.md)
   for the frozen matrix and evidence threshold.
5. Specify the smallest architecture that satisfies the approved scope. Do not
   design infrastructure, deployment, or an integration merely because it is a
   common pattern.
6. For a proposed architectural deepening, record a candidate card before
   settling interfaces: files or modules, the friction, the change, expected
   locality and testability benefit, and recommendation strength. Apply the
   deletion test from Reverse Engineering; do not add an abstraction that only
   relocates complexity. Define interfaces after the candidate and its
   contracts are selected, not as speculative alternatives.
7. Use the **Application-design record** in
   `aidlc/knowledge/shared/software-engineering-work-packets.md`; apply an
   observed section from `languages/profiles.md`, with `languages/common.md`,
   when it changes a boundary or proof obligation.

## Outputs

Record a coherent design in the intent's **Plan** section: candidate card when
applicable, component map, interface and data contracts, dependency direction,
architecture decisions, UI integration where applicable, and
requirements-to-design traceability. Link project-owned diagrams or design
documents if they are useful. Every output must be evidence-backed and usable
by Units Generation and Construction.

## Exit

Run the intent-evidence sensor. A material unresolved trade-off becomes a
focused question or re-plan; otherwise record completion and continue to Units
Generation. The 1.7 plan approval remains the only approval boundary.
