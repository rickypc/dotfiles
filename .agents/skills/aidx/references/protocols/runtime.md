# Runtime protocol

The AIDX state helper owns the state schema and legal transitions. The AIDX
skill owns the interaction contract. Specialized skills own their own commands,
tools, and proof. A reference file may explain a decision but must not invent
another router or transition.

Use repository instructions first, then the selected skill’s contract, then
the goal record and verified repository evidence. Use `/codebase-memory` for
code facts, `/knowledge-base` for durable private context, and the operating
system temporary directory for transient requests, receipts, locks, backups,
and evaluations.

Keep project code and project documentation in the selected repository. Keep
resumable AIDX records below the skill-local session root. Do not place private
context, secrets, or raw conversation into reusable references.

Operational check: [context check](../prompts/sensors/context.md).
