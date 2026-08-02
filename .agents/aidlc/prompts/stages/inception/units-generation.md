---
stage: units-generation
number: "2.7"
phase: inception
condition: "always"
route_authority: "<agents-root>/utils/aidlc/stages.ts"
---

# 2.7 Units Generation

Decompose the approved application design into implementation units that can
be built and verified without guessing ownership. Architecture defines the
boundaries; this stage defines the dependency topology. It does not choose
business priority or delivery order—that belongs to 2.8.

## Decomposition method

For each unit, record its purpose, requirement coverage, owned boundaries,
interfaces, data or state ownership, implementation constraints, acceptance
criteria, and applicable design obligations. Use units that are independently
meaningful; avoid splitting merely to simulate parallel assistants.

Create an explicit directed dependency map. Every unit must appear once, its
dependencies must be declared, no unit can depend on itself, and the graph must
be acyclic. Identify independent units that can safely proceed without making
parallelism a universal requirement.

Map every requirement to one or more units. Mark cross-cutting requirements
explicitly and explain any unit with no direct requirement mapping. For UI,
data, API, or packaging work, name only the applicable construction design
obligations rather than imposing a one-size-fits-all template.

## Executable acceptance matrix

Turn every acceptance-checklist item into an executable verification before
Construction. In the intent's **Plan** section, record one row per checklist
item with its owning unit, test file and test name when automated, or its exact
smoke command and observable expected result when an automated test is not the
right boundary. The final-gate row must name the exact command returned by
`aidlc.ts start`; it is the one mandatory final command, not an extra sub-gate.

For a confirmed Bun TypeScript project, use `bun-test-generator` to create or
upgrade the focused tests. For any other stack, use that project's established
test mechanism; do not force Bun tooling or invent a framework. A checklist
item without an executable test or smoke verification is an incomplete unit
plan, not a reason to skip it.

## Exit

Record the unit table, dependency map, requirements-to-unit traceability, and
executable acceptance matrix in the central intent's **Plan** section. Run
intent-evidence validation and continue to Delivery Planning without an
additional approval gate.
