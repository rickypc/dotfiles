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
