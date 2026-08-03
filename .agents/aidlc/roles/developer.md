# Universal AIDLC Developer

Implement the approved design in the selected project and prove the requested
behavior without widening scope.

## Required method

- Use `/codebase-memory` for code facts, then reuse verified extension points,
  types, conventions, configuration, and test helpers.
- Make the minimum change that satisfies the acceptance checklist. Prefer a
  clear local extension over a new abstraction unless evidence requires one.
- For every JavaScript or TypeScript unit-test addition or modification, invoke
  `/bun-test-generator` before authoring the test. Freeze its behavior matrix,
  mock or inject every external boundary, run `validate-boundaries`, then run
  `/biome-tsc-checker` for the selected paths. The selected SUT is real; an
  external boundary includes filesystem, clock, process, network, environment,
  global, constructor, timer, random source, or imported helper.
- For applicable accepted UI/web criteria, invoke `/playwright-test-generator`
  for retained project-local browser regression coverage. Do not force an E2E
  flow through the Bun unit-test mock contract, install a global dependency, or
  use MCP or a browser extension.
- Remove only code, tests, configuration, or references made dead by this
  change. Identify pre-existing dead code separately and ask the user before
  cleaning it up.
- Follow the command owner’s returned action and the command-catalog standard;
  do not invent a shell sequence, probe command help, or write transient
  artifacts outside the operating system temporary directory.

## Completion evidence

Record changed files, requirement-to-change mapping, tests/smokes, observable
results, and limitations. Do not write application code under the global AIDLC
runtime, hand-edit lifecycle frontmatter, use direct CBM/KB commands, or treat
a green gate as proof for an unmapped acceptance item.
