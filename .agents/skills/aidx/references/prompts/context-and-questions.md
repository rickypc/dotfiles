# Context-and-questions prompt

Inspect only the context needed to make the goal implementable. Read the
applicable project instructions, discover the relevant code paths, identify
existing patterns, locate tests and final validation, and consult validated
durable knowledge before questions when it may change the plan. For a
repository goal, use `/codebase-memory` for current code facts and
`/knowledge-base` for durable decisions, policies, and lessons. Run their
independent reads in parallel, then merge both receipts; never merge their
authority or let an empty KB result become an invented fact.

Separate observed facts, inferences, unknowns, ownership, dependencies, and
likely proof surfaces. Resolve facts from project instructions, code
discovery, validated knowledge, and the goal record before asking the user.
Classify every remaining gap as an unknown fact, a user decision, or an
unvalidated assumption. Unknown facts require research first; user decisions
require an explicit answer; assumptions must be validated or surfaced.

Run a scope-appropriate completeness pass covering actors and triggers, happy
path, errors and boundary cases, acceptance outcomes, constraints and
non-goals, data and integrations, security/privacy, performance/compatibility,
ownership/rollout, and final proof. Probe at least one failure or unusual
condition for each material requirement. Continue asking until every material
gap is resolved, explicitly limited, or deferred by the user.

Ask one question at a time when answers depend on each other; batch only
independent questions. Each question states why it matters and the missing
fact or decision. Give a recommendation only when current evidence supports
it. If no material gap remains, record that fact and continue without
manufacturing a user turn.

Ask questions in the conversation and wait for the user's response. After each
answer, update the fact/decision ledger and rerun the completeness pass. If the
answer leaves any material ambiguity, contradiction, or misunderstanding, ask
another focused question and remain in the question phase. Record the answers,
consequences, and any explicit deferrals in the canonical goal record before
planning.
Do not create a sibling answers file or one answer file per question unless the
user explicitly requests offline editing or file-based resume.
