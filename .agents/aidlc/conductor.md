# Universal AIDLC conductor

The lifecycle script chooses the current selected stage and emits one complete
stage packet. The conductor owns the quality of the work inside that packet:
read the named contracts, establish evidence, make or surface the decision,
run the named sensors, and record the outcome. The script owns route state;
the conductor must not invent state, stages, artifacts, or transitions.

## One assistant, several disciplined perspectives

The roles in a packet are review perspectives, not a requirement for an
assistant-native delegation feature. Begin with the lead perspective, then
apply each support perspective to the same evidence before synthesising one
clear result. Keep the contribution visible in the result: product clarifies
outcome and acceptance, architecture clarifies boundaries and trade-offs,
design clarifies usable UI where applicable, delivery clarifies sequence and
risk, development clarifies existing implementation constraints, quality
clarifies observable verification, and security clarifies threat and NFR risk.

Do not manufacture an opinion merely because a support perspective is listed.
If two perspectives identify a material conflict, describe the competing
options, the evidence, and the decision it blocks. Ask one focused question
only when the answer would change scope, behavior, architecture, safety, or
the final gate.

## Evidence discipline

Treat these sources as distinct:

- User instructions establish desired outcome and explicitly approved choices.
- Project instructions establish local conventions and project-owned commands.
- `codebase-memory` establishes code facts; use the skill, not an independent
  CBM/MCP/CLI/grep route.
- `knowledge-base` establishes durable private context and selects its own
  private-KB root; no intent or local reference can override it.
- The temporary intent establishes prior stage evidence, decisions, route, and
  approval status; its frontmatter is read and written only through the
  gray-matter lifecycle script.
- `aidlc/protocols/runtime.md` defines the protected runtime boundary: stage
  work may modify only the canonical temporary intent, never its packet assets.

Label claims as observed, user-provided, inferred, or unknown. Preserve a
contradiction until it is resolved; never silently choose the convenient one.

## Stage execution

1. Read every common, role, knowledge, sensor, and stage path in the packet.
2. Confirm the stage condition from `utils/aidlc/stages.ts`. A conditional
   stage that does not apply is skipped with a factual reason, not treated as
   an error or a conversational pause.
3. Perform only the current stage's work. Keep findings, decisions, plan,
   implementation evidence, and validation evidence in the matching sections
   of the central intent; link any project-owned document rather than creating
   a second global artifact tree.
4. Run the named sensor contracts and repair a failed result before recording
   completion. A sensor failure that shows an earlier decision is wrong is
   re-planning evidence, not a reason to bypass a stage.
5. Use `~/.agents/scripts/aidlc.ts complete` or `skip` with concise factual
   evidence, then use the next packet. Never hand-edit intent frontmatter,
   route status, or audit trail.

The deterministic bootstrap records 0.1–0.3 in one `prepare` response. It is
not an invitation to recreate an upstream workspace, native hooks, or local
memory tree.

## Questions, approval, and recovery

Batch only the unanswered material questions required for the current stage.
State what decision each question unlocks and preserve the answer in the
intent before relying on it. 1.7 is the sole plan approval: present Approve,
Re-plan, or Decline and do not enter Construction until approval is persisted.
No other selected stage creates a ceremonial approval gate.

On resume, load the central intent through the script, inspect its stage ledger
and audit events, then request the packet for its active stage. If an intent
cannot be parsed, report that its gray-matter frontmatter is invalid and repair
it using the supported script boundary before continuing; do not throw an
opaque parser stack or reconstruct state from guessed folders. If new evidence
invalidates a completed decision, record it with `replan`, identify the
affected downstream work, and revisit only that evidence-backed boundary.

## Construction closeout

At 3.6 invoke `~/.agents/scripts/aidlc.ts complete <intent-path>` with no
evidence. The project may define one `finalGate` in `aidlc.config.json`;
otherwise the command is `bun run test`. A non-zero result is failure,
including a cosmetic failure: repair and rerun the same lifecycle command.
Once it passes, ask `knowledge-base` whether a validated durable lesson should
be captured. Persist either the validated capture or a factual no-capture
assessment with `aidlc.ts closeout`; only then retire the temporary intent.
There is no Operation phase and no separate Closure phase.
