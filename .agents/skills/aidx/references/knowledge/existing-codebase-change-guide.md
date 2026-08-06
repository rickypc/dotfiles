# Existing-codebase change discipline

Use this guide when the selected project already contains the behavior being
changed. The purpose is to protect existing contracts with evidence, not to
force a second process, a universal baseline command, or a separate gate.

## Establish the current state

During `INSPECT_CONTEXT`, use `/codebase-memory` to identify the relevant
indexed project, symbols, call paths, data boundaries, consumers, existing
tests, and project conventions. Record only the facts needed for this goal: affected
behavior, dependencies, compatibility obligations, and the evidence that
supports each conclusion. A common home-directory prefix does not make two
repositories one project; a separately indexed repository is independent
context.

## Bound the change

Before implementation, identify the intended files or boundaries to change,
their consumers, relevant tests, public contracts, data migration impact,
security implications, and rollback or compatibility risks. State what must
remain unchanged. When the evidence indicates a material blast radius, return
to plan generation rather than hiding a feature inside a small patch.

## Implement conservatively

Modify the selected project in place and preserve established conventions.
Avoid duplicate replacement files, speculative rewrites, or an implementation
that changes unrelated behavior merely to make a local test easy. Add focused
tests when the approved change needs them, and record deviations from the plan
with their reason and impact.

## Validate once at the final boundary

The runtime does not impose a preliminary test or lint command on a polyglot
project. Use normal development feedback while implementing, then run the
repository's configured final command at the AIDX `TEST` boundary. Its receipt
is the final validation authority. A non-zero result is failure, including a
cosmetic failure, and must be repaired and re-run with the same command.
