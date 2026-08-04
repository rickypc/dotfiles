# Universal stage protocol

The returned packet is complete for the current decision: stage contract, role
perspectives, needed knowledge, and sensors. Read it once, then gather only
evidence needed for that stage.

1. Confirm the selected project and canonical intent; never borrow state from a
   similarly named project or CBM index.
2. Separate user-provided facts, project instructions, codebase-memory findings,
   validated KB context, inferences, and unknowns.
3. Produce concise stage evidence: what was observed, the decision or factual
   skip, scope impact, risks, and links to project-owned artifacts when useful.
4. Run named sensors. Repair their actionable finding or re-plan the affected
   decision; do not edit status fields to advance.
5. Execute only the lifecycle action returned by the runtime. Its command
   grammar, atomic boundaries, gray-matter handling, collision detection, and
   audit events are owned by `utils/aidlc/command-contract.ts`.

Clarification contract:

1. Resolve available evidence before asking: project instructions, the selected
   `/codebase-memory` project, `/knowledge-base` context, and the central
   intent are the first sources. Do not ask the user for a fact that those
   sources establish.
2. Label the gap as either an unknown fact or a user decision. An unknown fact
   needs research or an explicit limitation; a user decision needs the user's
   choice when it changes behavior, scope, security, architecture, a durable
   fact, or the final gate.
3. Ask one material question at a time. Explain why it matters, give a
   recommended answer grounded in the current evidence, and state the smallest
   consequence of each answer when that helps the user decide.
4. Wait before acting on an unresolved material decision. Do not silently
   choose a preference, turn uncertainty into a requirement, or implement a
   guessed boundary. If evidence resolves the issue, proceed and record the
   evidence instead of asking.

Batch only non-blocking questions or questions the current packet explicitly
allows together. At 1.7 end with Approve, Re-plan, or Decline; outside that
gate, record the conclusion and continue.

Sensors validate the stated property of the current stage and never add hidden
work. A conditional skip is a factual outcome, not a conversational pause.
Malformed intent frontmatter must produce the actionable gray-matter error and
be repaired through the lifecycle boundary; never reconstruct state from a
filename or guessed directory.
