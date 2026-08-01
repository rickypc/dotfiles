# Universal stage protocol

The packet is deliberately complete so the assistant does not need a sequence
of discovery calls merely to learn its role, stage method, knowledge guides,
and sensors. Read the entire packet once before working; then make the smallest
number of evidence-gathering calls needed for the named stage.

## Work loop

1. Verify the selected project and load the current intent through the script.
   Do not borrow state from a similarly named repository or another CBM index.
2. Read the packet's conductor, common contracts, stage prompt, role cards,
   knowledge paths, and sensor contracts. The packet defines the current
   surface; it does not authorize unrelated adjacent work.
3. Reconcile user intent, project instructions, codebase-memory findings, and
   knowledge-base context. Keep observed facts separate from assumptions.
4. Produce the current stage's evidence in the central intent: what was found,
   which decision was made, alternatives or risks, open questions, and links to
   project-owned documents or changed source files when applicable.
5. Run the named sensors. A failure is evidence to repair or re-plan, never a
   reason to advance by editing a status field.
6. Record `complete` with concise evidence or `skip` with its factual reason.
   Request the next packet immediately. Only a material unanswered question,
   the 1.7 approval, a final failure, or a terminal result stops the route.

## Question contract

Ask a question only when available evidence cannot safely resolve a decision
that changes behavior, scope, security, architecture, a durable fact, or the
final gate. Batch related questions for the same stage. Name the decision and
the practical choices; accept `Unknown` or `Not applicable` when truthful.
Do not re-ask for context already captured in the user request, intent,
validated KB result, or observed project evidence.

At 1.7 the response must end with Approve, Re-plan, or Decline. Outside 1.7,
record the stage conclusion and continue without a ceremonial check-in.

## Evidence and sensors

Intent evidence must be specific enough for a later assistant to reproduce
the conclusion: source location or query, the fact it supports, decision,
scope impact, and unresolved risk. A codebase-memory source identifies the
indexed project and relevant symbol/path; a knowledge-base source identifies
the validated concept or absence of one. Do not copy private KB content into
global documents or select a KB root yourself.

Sensors validate the stated property of the current stage. They do not add
hidden work. If a sensor reports a real defect, repair it inside the current
stage when possible; if it invalidates an upstream conclusion, use `replan`
with the evidence and revisit the affected work deliberately.

## Lifecycle boundary

Use only `~/.agents/scripts/aidlc.ts` for `prepare`, `queue`, `complete`,
`skip`, `approve`, `replan`, `supersede`, and `retire`. It owns gray-matter
parsing, lifecycle validation, collision detection, and audit events. If an
intent is malformed, surface the clear invalid-frontmatter error to the
assistant/user and repair through the supported boundary; never use an
unhandled parser exception or invent replacement state.

At 3.6 invoke `aidlc.ts complete <intent-path>` once per attempt with no
evidence. It executes the resolved configured command as the only final gate.
On failure, fix and rerun the same lifecycle command; on success, capture
reusable knowledge through `knowledge-base` if warranted and retire the central
intent.
