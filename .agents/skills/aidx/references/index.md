# AIDX reference map

Use this map to select references after the goal and repository evidence are
known. Do not load every reference for a small change.

- [state-model.md](state-model.md) — persisted record, user-editable questions,
  required sections, and legal transitions.
- [implementation-plan.md](implementation-plan.md) — approved implementation
  plan and validation-reconciliation template.
- [conductor.md](conductor.md) — response-quality and evidence discipline
  across the AIDX sequence.
- [protocols/index.md](protocols/index.md) — authority, recovery, approval,
  and evidence rules.
- [roles/index.md](roles/index.md) — selectable product, architecture, design,
  delivery, implementation, quality, and security perspectives.
- [prompts/index.md](prompts/index.md) — focused prompt contracts for capture,
  questions, planning, approval, implementation, and validation.
- [knowledge/index.md](knowledge/index.md) — map of reusable engineering
  references and selective-loading guidance.

## How the reference layers connect

- [Role perspectives](roles/index.md) define the decision lens and required
  output for a discipline. Each perspective links to its matching
  [knowledge branch](knowledge/roles/index.md), which supplies methods,
  patterns, and templates rather than another AIDX state.
- [Protocols](protocols/index.md) define normative invariants and ownership.
  [Evidence checks](prompts/sensors/index.md) make those invariants observable
  as compact pass/fail contracts for the state helper and interaction.
- [Prompt contracts](prompts/index.md) are the focused instructions that use
  the role, knowledge, protocol, and check layers. They do not create another
  router.

Explicit relative Markdown links are the canonical document relationships.
Frontmatter is optional metadata for machine selection of records or lessons;
it is not a substitute for a link. Use `/codebase-memory` for approved code
discovery, but do not assume its code graph will infer a semantic graph of
these Markdown references.
