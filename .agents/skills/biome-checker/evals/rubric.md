---
minimumPassRate: 1
requiredCaseFields:
  [
    id,
    visibility,
    scenario,
    assertions,
    failureMode,
    repairBoundary,
    independentVerifier,
  ]
requiredVisibility: [candidate, challenge]
schemaVersion: 1
verifierIds: [source-structure]
---

# Biome TSC Checker Evaluation Rubric

The package follows the shared seven-part skill contract:
1. Role and scope
2. Usage
3. Immutable operational rules
4. Input and context schema
5. Ordered execution chain
6. Output and completion contract
7. Evaluation anchors

The canonical matrix checks all seven headings. It rejects brittle exact-output language and robotic
personas. Keep this contract compatible with the skill's uncertainty, ownership, and proof boundary.

Verify lint, TypeScript, and top-level declaration order for the selected paths.
Do not change target configuration or declaration meaning.
Report barriers and cycles. Do not cross them.

For a fresh session, verify the JSON result protocol:
- `passed` reports success.
- `failed` includes an action packet.
- `blocked` means the requested reorder is not permitted.
