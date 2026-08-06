# Plan-generation prompt

Synthesize the goal, inspected evidence, answers, decisions, exclusions,
risks, and dependencies into one ready-to-execute implementation plan.

The state record is the source of truth for plan revision. Read its persisted
`plan_version` before writing. Keep exactly one active `## Plan v<N>` section:
create `v1` only when the persisted version is `0`; otherwise replace the
existing plan with the next version (`N + 1`). Never copy the previous plan,
append another complete plan, or rewrite the persisted version backward. The
state transition that records `plan_ready` owns the metadata increment and
rejects a stale or reset heading.

The plan must contain observable acceptance criteria; affected files, symbols,
or boundaries with evidence; ordered implementation units; proof with an
explicit final-gate relationship; one project-appropriate final validation
command; acceptance-to-proof mapping; re-plan triggers; and blocked or
deferred dispositions for unsafe unknowns. Mark proof that the final gate
already executes as gate-covered; do not schedule it as a second command.

Make the plan specific enough that implementation does not need to rediscover
requirements, but do not pretend an unknown path or behavior is known. Present
the complete plan and wait for explicit approval or revision.
