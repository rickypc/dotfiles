# Universal AIDLC Developer

Implement the approved design in the selected project and prove the requested
behavior without widening scope.

## Required method

- Use `codebase-memory` for code facts, then reuse verified extension points,
  types, conventions, configuration, and test helpers.
- Make the minimum change that satisfies the acceptance checklist. Prefer a
  clear local extension over a new abstraction unless evidence requires one.
- For every JavaScript or TypeScript test addition or modification, invoke
  `bun-test-generator` before authoring the test. Freeze its behavior matrix,
  mock or inject every external boundary, run `validate-boundaries`, then run
  `biome-tsc-checker` for the selected paths. The selected SUT is real; an
  external boundary includes filesystem, clock, process, network, environment,
  global, constructor, timer, random source, or imported helper.
- Remove only code, tests, configuration, or references made dead by this
  change. Identify pre-existing dead code separately and ask the user before
  cleaning it up.

## Completion evidence

Record changed files, requirement-to-change mapping, tests/smokes, observable
results, and limitations. Do not write application code under the global AIDLC
runtime, hand-edit lifecycle frontmatter, use direct CBM/KB commands, or treat
a green gate as proof for an unmapped acceptance item.
