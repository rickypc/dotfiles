# Command Catalog Design Standard

## Purpose

A command catalog is an executable interface for an assistant. It reduces
tool retries only when the assistant can choose one command deterministically
from the current situation. The typed command owner is the executable source
of truth; this document defines how every derived human-facing table refers to
that source.

## Ownership

- One typed runtime or script owns each command grammar and rendered catalog.
- Skills, roles, prompts, and AGENTS files link to that catalog. They do not
  restate flags, optional argument syntax, or recovery aliases.
- A table that is not a public command catalog states its owner and links to
  the canonical catalog before describing an action.

## Required row structure

Order rows from the normal, most likely path to conditional recovery paths.
Every row contains all five facts:

1. **When:** a direct, observable condition.
2. **Command:** one full command line for that one condition.
3. **Arguments:** every positional value and flag explained.
4. **Result:** the receipt or state change the command returns.
5. **Next:** the only allowed next action, including when to stop.

Write one row for each flag variation. Do not use ellipses, bracketed optional
syntax, inferred positional arguments, a guessed path, a help probe, or a
retry with altered arguments. A command may use only angle-bracket
placeholders such as `<intent-path>`; each placeholder must be defined in the
same catalog. A grammar description is not a copyable invocation.

## Batching rule

Combine only independent facts that are already established and whose owner
can validate every member. The batch command returns one ordered receipt for
all members. It must not cross an approval boundary, invent outcomes, suppress
an individual failure, or make an external side effect concurrent merely to
reduce calls.

## Temporary and external boundaries

Any transient request, receipt, lock, backup, or evaluation artifact uses the
operating system temporary directory through `tmpdir()`. A script may parse a
validated JSONL handoff from that directory, but an external CLI receives only
its documented flags. Unit tests inject and mock filesystem, process, network,
clock, environment, and other external boundaries; no live dependency is a
unit-test requirement.

## Review checklist

- Is there exactly one canonical command owner?
- Is the normal path above all recovery paths?
- Can a dense model select a row without interpreting shorthand?
- Does every rendered example contain no user-specific value and no ellipsis?
- Does every batch return each member result in one receipt?
- Do all derived references link here or to the typed owner rather than copy
  command syntax?
