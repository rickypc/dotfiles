# Command catalog design standard

A command catalog is an executable interface for an assistant. It reduces
retries only when one command can be selected deterministically from an
observable condition. The typed script or skill that owns the command is the
source of truth; prose references link to it instead of restating its grammar.

Every row contains:

1. **When:** a direct condition.
2. **Command:** one complete invocation.
3. **Arguments:** every positional value and flag.
4. **Result:** the receipt or state change.
5. **Next:** the only allowed next action, including when to stop.

Evidence paths in these commands point to compact, event-specific receipts.
Never pass the goal record as its own evidence path because the state helper
embeds evidence content into the audit and would recursively duplicate the
record.

Order normal paths before recovery paths. Do not use ellipses, guessed paths,
help probes, inferred optional syntax, or retries with altered arguments. Use
only defined placeholders.

Batch only independent, already-established facts whose owner validates every
member. A batch must not cross approval boundaries, suppress an individual
failure, or create an external side effect merely to reduce calls.

Transient requests, receipts, locks, backups, and evaluation artifacts belong
in the operating-system temporary directory. Tests inject filesystem, process,
network, clock, environment, and other external boundaries. Review that there
is one command owner, copyable examples, complete receipts, and links to the
owner rather than duplicate syntax.

## Delegated skill contract

When a capability belongs to another skill, the caller selects that skill and
follows its command catalog. AIDX supplies the goal, context, approval, scope,
and resume boundary; it does not reimplement the delegated skill.

Use this row shape when documenting a delegated operation:

| When | Command owner | Arguments | Result | Next |
| --- | --- | --- | --- | --- |
| `<observable-condition>` | `/<skill-name>` | `<skill-arguments>` | `<receipt-or-result>` | `<next-action>` |

`/<skill-name> <pattern>` is a notation pattern, not a command to send
literally. Replace every placeholder with the selected skill's canonical
contract, including its required paths and flags. Read that owner before
invocation, preserve its receipt, and repair or re-plan from the returned
evidence. If no existing skill owns the capability, record the gap and ask or
re-plan instead of making AIDX own a second command router.

## AIDX state-helper call compression

The AIDX state helper is deterministic, but it does not call the LLM or
discover repository facts. Use its receipts to avoid read-after-write calls.

| When | Command owner | Arguments | Result | Next |
| --- | --- | --- | --- | --- |
| A new request has no existing goal record. | `aidx.ts` | One absolute request JSON path using the canonical schema: required `id`, `goal`, `cbmIndex`, `projectRoot`; optional `initialContext`, `concerns`, `requestedOutcome`. | `created`, canonical path, state, legal events, and next action. | Continue from the returned path; do not call `init` again. |
| The same canonical request is retried after a lost or duplicated receipt. | `aidx.ts` | The same canonical request JSON path with the same field names and values. | `existing` when the request matches the record. | Resume the returned path. |
| One state transition has one prepared evidence file. | `aidx.ts` | Goal path, canonical event, absolute evidence path. | `updated` or `already-applied`, plus current state and next action. | Follow the returned next action; do not call `status` immediately. |
| Several prepared context, question, or plan transitions are independent and no approval or external side effect lies between them. | `aidx.ts` | Goal path and one absolute batch JSON path containing `steps[].event` and `steps[].evidencePath`. | One atomic record write and one receipt for all applied steps. | Continue from the returned next action. |
| A transition crosses approval, implementation, testing, repair, block/defer, or lesson closeout. | `aidx.ts` | One goal path, one event, and one evidence path. | One state transition receipt. | Keep the boundary explicit; do not batch it. |

| A run is in `DISTILL_LESSON` with one active plan and validation has passed. | `aidx.ts` | Goal path and one absolute distill-decision JSON path. The JSON contains `planVersion`, one `disposition`, `justification` when the disposition is negative, and `knowledgeBaseReceiptPath` when the disposition is positive. | Finalization receipt with the disposition, current plan version, plan-removal result, and next action. | Follow the returned action; invoke `lesson_complete` only after the receipt confirms plan removal. |

| The LLM decides the reviewed plan contains a durable lesson. | `/knowledge-base` | The selected skill's exact retrieval/reconciliation arguments plus the reviewed-plan evidence; preserve the returned receipt path. | Validated durable-capture receipt owned by `/knowledge-base`. | Write the positive finalizer decision with that receipt path, then invoke the AIDX finalizer. |

| The LLM decides the reviewed plan contains no durable lesson. | `aidx.ts` | The fixed decision JSON with the current plan version, negative disposition, and non-empty factual justification; omit the delegated receipt path. | Deterministic finalization receipt after the justification is validated and the plan is removed. | Invoke `lesson_complete`; do not call delegated capture for this branch. |

The finalizer decision JSON uses this pattern; replace every placeholder with a
value from the current record or the delegated receipt. Do not add fields,
reuse a stale plan version, pass the goal record as evidence, or remove the
plan before the command succeeds:

```json
{
  "planVersion": <current-plan-version>,
  "disposition": "<no-durable-lesson|new-primary|update-existing>",
  "justification": "<required for the negative disposition>",
  "knowledgeBaseReceiptPath": "<required for a positive disposition>"
}
```

Event names are canonical snake_case. The helper accepts common hyphenated
spellings and normalizes them once, but callers should use the canonical event
names. Init fields are stricter: snake_case aliases, unknown fields, missing
required fields, and wrong value types are rejected with canonical schema
guidance rather than normalized. If a mutation errors, read the error; when
commit status is ambiguous, inspect the record once before retrying. Never
issue serial `status` and `validate` calls after a successful receipt.

Configuration fields are a separate contract: use `finalGate` in
`aidx.json`; do not write `final_gate`. The JSON file is data only and its
optional `finalGate` value must be a string, while persisted goal metadata uses the
documented `snake_case` keys.

| When | Command owner | Arguments | Result | Next |
| --- | --- | --- | --- | --- |
| A resolved project needs its one final validation command. | `aidx.ts` | `<absolute-project-root>` | Reads `aidx.json` or uses the default `bun run test`, then returns a gate receipt. | Record the receipt at `TEST`; on failure, repair the complete affected boundary and run this same command once. |
