---
stage: application-design
number: "2.6"
phase: inception
condition: "always"
route_authority: "~/.agents/utils/aidlc/stages.ts"
---

# 2.6 Application Design

Design the approach before implementation units are generated. Use product,
architect, and design perspectives returned by the packet. Add platform or
compliance analysis only when it is material to the approved requirements.

## Design method

1. Read requirements, Reverse Engineering evidence when brownfield, and the UI
   definition when present. Identify existing components that can be reused and
   boundaries that must remain compatible.
2. Define components or modules, responsibilities, public interfaces, data
   ownership, communication paths, dependencies, error handling, and material
   NFR consequences.
3. Compare viable architectural alternatives where a decision has meaningful
   trade-offs. Record context, decision, consequences, rejected alternatives,
   and reversibility in an ADR-style entry in the central intent.
4. Specify the smallest architecture that satisfies the approved scope. Do not
   design infrastructure, deployment, or an integration merely because it is a
   common pattern.

## Outputs

Record a coherent design in the intent's **Plan** section: component map,
interface and data contracts, dependency direction, architecture decisions,
UI integration where applicable, and requirements-to-design traceability. Link
project-owned diagrams or design documents if they are useful. Every output
must be evidence-backed and usable by Units Generation and Construction.

## Exit

Run the intent-evidence sensor. A material unresolved trade-off becomes a
focused question or re-plan; otherwise record completion and continue to Units
Generation. The 1.7 plan approval remains the only approval boundary.
