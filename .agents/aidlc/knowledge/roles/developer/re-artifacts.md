# Reverse-engineering evidence pack

## Purpose

Reverse engineering records the verified current state needed to make one safe
change. It is not a second durable codebase index: codebase-memory remains the
authoritative code-discovery system and knowledge-base remains the only private
knowledge store.

## Required evidence

For the affected boundary, capture:

1. **Business behavior** — purpose, actor, entry point, successful result, and
   observable failure behavior.
2. **Structure** — modules/packages, owning component, public interfaces,
   dependency direction, and test locations.
3. **Data and integration flow** — state owner, persistence/migration impact,
   events or APIs, external dependencies, authorization boundaries.
4. **Technology and quality facts** — language/framework/build owner, project
   conventions, relevant existing tests, and technical-debt signals.
5. **Uncertainty** — separate observed facts from inferences and identify what
   could change the implementation decision.

## Code scan handoff template

~~~markdown
## Verified code context

### Sources
- codebase-memory query/result: [reference]
- project instruction or manifest: [path]
- knowledge-base concept: [validated path, if applicable]

### Relevant flow
- Entry: [route/command/event]
- Owner: [module/component]
- Dependencies: [upstream and downstream]
- State/data: [owner and invariants]
- Tests: [existing coverage and gaps]

### Constraints and risks
- [observed convention, compatibility constraint, or uncertainty]
~~~

## Architecture synthesis

The architect translates this evidence into component boundaries and decisions.
Do not declare a package, API, dependency, or quality claim without its source.
Do not create active-space files, a local code KB, or generic repository scans
outside the approved change boundary.
