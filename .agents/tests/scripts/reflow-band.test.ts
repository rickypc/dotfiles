/**
 * reflow-band.test.ts - band-mode greedy max-fill goldens (s43-s74).
 * Scope: shared-suite-integration - the SUT (scripts/reflow.ts band mode) and
 * its local engine (utils/reflow.ts) stay real; every fixture is inline, so no
 * filesystem boundary is touched.
 */

import { describe, expect, test } from 'bun:test';
import { reflowText, verifyInvariants } from '../../utils/reflow-file.js';

const aidpGateAuthored = [
  "- **Configured Final Gate.** Verify the final-gate command string against the project's",
  '  `package.json` or `aidx.json` BEFORE writing the plan; the gate is `bun run test` (the agents-root',
  "  default) when no project override exists, otherwise it is `aidx.json`'s `finalGate`, otherwise the",
  '  configured project gate. For npm-based projects the equivalent is',
  "  `npm run test && npm run test:e2e` (or whichever string the project's `test` and `test:e2e`",
  '  scripts compose). Do NOT invent a plausible-looking chain such as',
  '  `npm run test:lint && npm run test:unit && npm run test:e2e && npm run build` - that string is',
  '  wrong on most projects; verify first, then name the gate.',
].join('\n');

const aidpQuoteAuthored = [
  '- A framework, library, command, gate string, or API shape inferred from "how these projects usually',
  '  work" rather than verified against the repo or `package.json`.',
].join('\n');

const aidpQuoteExpected = [
  '- A framework, library, command, gate string, or API shape inferred from',
  '  "how these projects usually work" rather than verified against the repo or `package.json`.',
].join('\n');

const aidxCloseoutAuthored = [
  "After execution, AIDX must complete the plan's closeout before considering retirement. It must",
  'atomically update every successful workflow item to `[x]`, mark intentionally skipped items `[-]`',
  'with a reason, leave no `[ ]`, `[~]`, or `[!]` item, set frontmatter `status` to `completed`, and',
  'validate the updated plan at its same absolute path with',
  '`bun <agents-root>/scripts/aidx-completed-plan-validator.ts <absolute-plan-path>`. That validator',
  'owns the completed-plan contract; never reuse `aidp-plan-validator.ts`, which requires an unchecked',
  'pending plan and rejects a completed closeout. A stale `pending` field is not evidence that',
  'execution is incomplete, but it is also not permission to infer completion: the current checklist,',
  'receipts, acceptance mapping, and final gate must all prove the terminal state. If AIDX cannot write',
  'or validate this closeout, it must stop and must not distill or remove the plan.',
].join('\n');

const biomeOrderAuthored = [
  '3. **Declaration order:** Run the CST inspection for every selected path. For',
  '   `passed`, make no order edit. For `failed`, require a non-null action',
  '   packet, read every `requiredActionGroups` entry, and immediately apply the',
  '   packet through `declaration-order.ts --apply <one-allowed-path>`; move only',
  "   whole declarations in the packet's `allowedPaths`. The packet is an",
  '   executable repair instruction, not report-only output. For `blocked`, report',
  '   the duplicate, shadowing, or cycle and make no edit.',
].join('\n');

const biomeOrderExpected = [
  '3. **Declaration order:** Run the CST inspection for every selected path. For `passed`, make no',
  '   order edit. For `failed`, require a non-null action packet, read every `requiredActionGroups`',
  '   entry, and immediately apply the packet through',
  "   `declaration-order.ts --apply <one-allowed-path>`; move only whole declarations in the packet's",
  '   `allowedPaths`. The packet is an executable repair instruction, not report-only output. For',
  '   `blocked`, report the duplicate, shadowing, or cycle and make no edit.',
].join('\n');

const btgScopeAuthored = [
  'The default scope is `isolated-unit`. In `shared-suite-integration`, the SUT and local',
  'helpers remain real, local relative modules are not registered with `mock.module()`, and',
  'process/filesystem/network/package/global boundaries still require explicit mocks. This scope is an',
  'explicit preservation decision, not a bypass.',
  '',
  'For a globally owned browser-runtime exception, the canonical test may live at',
  '`<owner-root>/tests/runtime/<sut-name>.test.ts`; **do not copy or symlink** the',
  'SUT. Import `mock` from `bun:test`; never use `spyOn` or a live `mock` boundary.',
].join('\n');

const btgScopeExpected = [
  'The default scope is `isolated-unit`. In `shared-suite-integration`, the SUT and local helpers',
  'remain real, local relative modules are not registered with `mock.module()`, and',
  'process/filesystem/network/package/global boundaries still require explicit mocks. This scope is an',
  'explicit preservation decision, not a bypass.',
  '',
  'For a globally owned browser-runtime exception, the canonical test may live at',
  '`<owner-root>/tests/runtime/<sut-name>.test.ts`; **do not copy or symlink** the SUT. Import `mock`',
  'from `bun:test`; never use `spyOn` or a live `mock` boundary.',
].join('\n');

const eecMapAuthored = [
  'This contract incorporates the reviewed language common/profile guidance,',
  'architect/developer/product/quality/security/design/delivery role contracts,',
  'shared evidence, brownfield, work-packet, verification, and rules-reading',
  'guidance, plus the useful construction, requirements, UI, NFR, reverse',
  'engineering, and recovery obligations. Runtime scripts, lifecycle state,',
  'duplicated stage machinery, and implementation-specific examples were not',
  'copied because execution must remain plan-directed and project-owned.',
].join('\n');

const eecMapExpected = [
  'This contract incorporates the reviewed language common/profile guidance,',
  'architect/developer/product/quality/security/design/delivery role contracts, shared evidence,',
  'brownfield, work-packet, verification, and rules-reading guidance, plus the useful construction,',
  'requirements, UI, NFR, reverse engineering, and recovery obligations. Runtime scripts, lifecycle',
  'state, duplicated stage machinery, and implementation-specific examples were not copied because',
  'execution must remain plan-directed and project-owned.',
].join('\n');

const footAuthored = [
  'Text with a footnote reference here.[^10]',
  '',
  '[^10]: A narrow authored footnote definition whose content is',
  '   wrapped under the band and must refill to the max-fill wrap.',
  '',
  '[^1000]: A wider label whose continuation alignment shifts by the wider marker and must also refill now.',
].join('\n');

const footExpected = [
  'Text with a footnote reference here.[^10]',
  '',
  '[^10]: A narrow authored footnote definition whose content is wrapped under the band and must refill',
  '       to the max-fill wrap.',
  '',
  '[^1000]: A wider label whose continuation alignment shifts by the wider marker and must also refill',
  '         now.',
].join('\n');

const lazyAuthored = [
  '> 1. A lazy blockquote item keeps its lazy continuation',
  '     untouched because re-emitting a lazy region is not deterministic.',
].join('\n');

// A prose continuation indented under the marker's content column is a lazy
// continuation: CommonMark keeps it inside the item, so the item regroups and
// the wrap realigns every continuation under the content column.
const lazyItemAuthored = [
  '3. **Definition:** Specify layout, type, color, spacing, hierarchy, copy,',
  '  controls, loading/empty/error/success states, keyboard/focus behavior,',
  '  responsive behavior, accessibility, reduced motion, real asset/icon usage,',
  '  design-system fidelity, and browser-observable proof. Use `/content-writer`',
  '  for product-meaningful copy.',
].join('\n');

const lazyItemExpected = [
  '3. **Definition:** Specify layout, type, color, spacing, hierarchy, copy, controls,',
  '   loading/empty/error/success states, keyboard/focus behavior, responsive behavior, accessibility,',
  '   reduced motion, real asset/icon usage, design-system fidelity, and browser-observable proof. Use',
  '   `/content-writer` for product-meaningful copy.',
].join('\n');

const lazyOverAuthored = [
  '9. The first lazy item line deliberately runs well past the one hundred column limit with words and keeps going',
  '  while the continuation stays lazily indented under the marker content column.',
].join('\n');

// A column-zero prose line after an item is not a lazy continuation: the item
// keeps its own single-line block and the line starts a separate paragraph.
const zeroIndentAuthored = [
  '1. one authored item line stays single',
  'prose at column zero must not join the item above it',
].join('\n');

const lazyOverExpected = [
  '9. The first lazy item line deliberately runs well past the one hundred column limit with words and',
  '   keeps going while the continuation stays lazily indented under the marker content column.',
].join('\n');

const quoteAuthored = [
  '> A quoted paragraph authored narrow under the band floor that',
  '> band mode must refill into the greedy max-fill wrap while the',
  '> quote format stays identical on every emitted line.',
  '',
  '> Second quoted paragraph after the separator keeps its own refill.',
].join('\n');

const quoteExpected = [
  '> A quoted paragraph authored narrow under the band floor that band mode must refill into the greedy',
  '> max-fill wrap while the quote format stays identical on every emitted line.',
  '',
  '> Second quoted paragraph after the separator keeps its own refill.',
].join('\n');

describe('band mode: greedy max-fill goldens', () => {
  // Mutation map: restoring the band-floor penalty in lineCost fails every
  // refill golden below; restoring the violation-only band selector fails the
  // s37 and btgScope refills; removing the quote or footnote block builders
  // fails s49 or s51; default mode must leave every authored fixture unchanged.

  test('s43: a below-band numbered item refills with one atom-forced short line', () => {
    const r = reflowText(biomeOrderAuthored, { band: true });
    expect(r.output).toBe(biomeOrderExpected);
    expect(r.output.split('\n')[2]).toBe('   entry, and immediately apply the packet through');
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(biomeOrderAuthored, r.output)).toEqual([]);
    expect(reflowText(biomeOrderAuthored).changed).toBe(false);
  });

  test('s44: an atom-forced in-band list item is a greedy fixed point', () => {
    const r = reflowText(aidpGateAuthored, { band: true });
    expect(r.changed).toBe(false);
    expect(r.output).toBe(aidpGateAuthored);
    expect(r.residuals).toEqual([]);
  });

  test('s45: an atom-forced in-band paragraph is a greedy fixed point', () => {
    const r = reflowText(aidxCloseoutAuthored, { band: true });
    expect(r.changed).toBe(false);
    expect(r.output).toBe(aidxCloseoutAuthored);
    expect(r.residuals).toEqual([]);
  });

  test('s46: a quoted span never splits and the break moves before it', () => {
    const r = reflowText(aidpQuoteAuthored, { band: true });
    expect(r.output).toBe(aidpQuoteExpected);
    expect(r.output).toContain('"how these projects usually work"');
    expect(verifyInvariants(aidpQuoteAuthored, r.output)).toEqual([]);
  });

  test('s47: in-band non-max-fill and below-band scope paragraphs refill greedily', () => {
    const r = reflowText(btgScopeAuthored, { band: true });
    expect(r.output).toBe(btgScopeExpected);
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(btgScopeAuthored, r.output)).toEqual([]);
    expect(reflowText(btgScopeAuthored).changed).toBe(false);
  });

  test('s48: a below-band paragraph refills with its atom-forced first line kept', () => {
    const r = reflowText(eecMapAuthored, { band: true });
    expect(r.output).toBe(eecMapExpected);
    expect(r.output.split('\n')[0]).toBe(eecMapAuthored.split('\n')[0]);
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
  });

  test('s49: quoted prose reflows with the quote format kept on every line', () => {
    const r = reflowText(quoteAuthored, { band: true });
    expect(r.output).toBe(quoteExpected);
    for (const line of r.output.split('\n').filter((l) => l.length > 0)) {
      expect(line.startsWith('> ')).toBe(true);
    }
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(quoteAuthored, r.output)).toEqual([]);
  });

  test('s50: a lazy quote region stays authored in band mode', () => {
    const r = reflowText(lazyAuthored, { band: true });
    expect(r.changed).toBe(false);
    expect(r.output).toBe(lazyAuthored);
  });

  test('s51: footnote definitions reflow with label-aligned continuations', () => {
    const r = reflowText(footAuthored, { band: true });
    expect(r.output).toBe(footExpected);
    const defs = r.output.split('\n').filter((l) => l.startsWith('[^'));
    expect(defs).toHaveLength(2);
    expect(r.output).toContain('\n       to the max-fill wrap.');
    expect(r.output).toContain('\n         now.');
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(footAuthored, r.output)).toEqual([]);
    expect(reflowText(footAuthored).changed).toBe(false);
  });

  test('s52: a footnote label without a separating space stays authored', () => {
    const text = [
      'Intro here.[^1]',
      '',
      '[^1]:narrow content without a space after the label that must stay exactly as authored now.',
    ].join('\n');
    const r = reflowText(text, { band: true });
    expect(r.changed).toBe(false);
    expect(r.output).toBe(text);
  });
});

describe('band mode: lazy continuation goldens', () => {
  // Mutation map: restoring the strict content-column floor in listContRow
  // fails s69 and s71 with an orphaned first line; slicing continuations at
  // the block column instead of their own indent fails both by corrupting the
  // first continuation word.
  test('s69: a lazy item regroups and refills under the content column', () => {
    const r = reflowText(lazyItemAuthored, { band: true });
    expect(r.output).toBe(lazyItemExpected);
    expect(r.output.split('\n')[1].startsWith('   loading/empty')).toBe(true);
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(lazyItemAuthored, r.output)).toEqual([]);
    expect(reflowText(lazyItemAuthored).changed).toBe(false);
  });

  test('s70: an authored lazy item with no over-limit line stays authored', () => {
    const band = reflowText(lazyItemAuthored, { band: true });
    expect(reflowText(band.output).changed).toBe(false);
    expect(reflowText(lazyOverAuthored, { band: true }).residuals).toEqual([]);
    expect(reflowText(zeroIndentAuthored, { band: true }).output).toBe(zeroIndentAuthored);
  });

  test('s71: default mode wraps an over-limit lazy item as one block', () => {
    const r = reflowText(lazyOverAuthored);
    expect(r.changed).toBe(true);
    expect(r.output).toBe(lazyOverExpected);
    expect(r.residuals).toEqual([]);
    expect(r.output.split('\n')[1].startsWith('   keeps')).toBe(true);
    expect(reflowText(r.output).changed).toBe(false);
    expect(verifyInvariants(lazyOverAuthored, r.output)).toEqual([]);
  });
});

describe('band mode: unbreakable-atom goldens', () => {
  // Mutation map: dropping the atomsFit band bypass fails s72 and s73 with an
  // unchanged block; dropping the endsAtUnbreakable exemption fails both the
  // same way; dropping the band-floor guard inside endsAtUnbreakable fails s73
  // with the 84-column line absorbing the 122-column span.
  const contractTokensHead = [
    'The protected command-contract tokens remain `<approved-root>`, `<query>`,',
    '`<absolute-jsonl-request-path-under-os-tempdir>`, `<private-kb-root>`, and',
    '`<repo-search-index>`. The canonical command strings remain',
    '`bun <agents-root>/scripts/repo-search.ts "<approved-root>" "<query>"`,',
    '`bun <agents-root>/scripts/repo-search.ts inspect "<approved-root>" '
      + '"<absolute-jsonl-request-path-under-os-tempdir>"`,',
    'and `bun <agents-root>/scripts/knowledge-base.ts search "<private-kb-root>" '
      + '"<repo-search-index>" "<query>"`;',
    'their caller-facing options table is maintained only in `SKILL.md`.',
  ].join('\n');

  const contractTokensBand = [
    'The protected command-contract tokens remain `<approved-root>`, `<query>`,',
    '`<absolute-jsonl-request-path-under-os-tempdir>`, `<private-kb-root>`, and `<repo-search-index>`.',
    'The canonical command strings remain',
    '`bun <agents-root>/scripts/repo-search.ts "<approved-root>" "<query>"`,',
    '`bun <agents-root>/scripts/repo-search.ts inspect "<approved-root>" '
      + '"<absolute-jsonl-request-path-under-os-tempdir>"`,',
    'and `bun <agents-root>/scripts/knowledge-base.ts search "<private-kb-root>" '
      + '"<repo-search-index>" "<query>"`;',
    'their caller-facing options table is maintained only in `SKILL.md`.',
  ].join('\n');

  test('s72: band mode refills a block holding unbreakable command atoms', () => {
    const r = reflowText(contractTokensHead, { band: true });
    expect(r.output).toBe(contractTokensBand);
    expect(r.changed).toBe(true);
    expect(r.residuals).toEqual([]);
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(contractTokensHead, r.output)).toEqual([]);
    expect(reflowText(contractTokensHead).changed).toBe(false);
  });

  test('s73: an in-band line never absorbs the unbreakable token after it', () => {
    const head = [
      'word word word word word word word word',
      'word word word word word word word word word',
      `\`${'x'.repeat(120)}\``,
      'tail text.',
    ].join('\n');
    const expected = ['word '.repeat(17).trim(), `\`${'x'.repeat(120)}\``, 'tail text.'].join('\n');
    const r = reflowText(head, { band: true });
    expect(r.output).toBe(expected);
    expect(r.output.split('\n')[0]).toHaveLength(84);
    expect(r.output.split('\n')[1]).toHaveLength(122);
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(head, r.output)).toEqual([]);
  });
});

describe('band mode: line-leading link goldens', () => {
  // Mutation map: dropping the completeLinkStart exemption in breakLegal
  // fails s74 with the pulled-word shape, where the wrap breaks one word
  // early so no line leads with a complete inline link.
  const ownershipHead = [
    'The `quality-engine` owns evaluation state and receipts; Skill Manager owns the',
    'skill contract, resources, references, matrices, repair packet, and final',
    'changed-file/evidence handoff. Read [skill-lifecycle.md](references/skill-lifecycle.md)',
    'for the method, [skill-template.md](references/skill-template.md) for the',
    'shared seven-part contract, [agent-skills-guidance.md](references/agent-skills-guidance.md)',
    'for Agent Skills specification and creation practices, and [index.md](references/index.md)',
    'for the map. Load the Agent Skills guidance for package design, description,',
    'evaluation, script, or specification decisions.',
  ].join('\n');

  const ownershipBand = [
    'The `quality-engine` owns evaluation state and receipts; Skill Manager owns the '
      + 'skill contract,',
    'resources, references, matrices, repair packet, and final changed-file/evidence handoff. Read',
    '[skill-lifecycle.md](references/skill-lifecycle.md) for the method,',
    '[skill-template.md](references/skill-template.md) for the shared seven-part contract,',
    '[agent-skills-guidance.md](references/agent-skills-guidance.md) for Agent Skills '
      + 'specification and',
    'creation practices, and [index.md](references/index.md) for the map. Load the Agent Skills '
      + 'guidance',
    'for package design, description, evaluation, script, or specification decisions.',
  ].join('\n');

  test('s74: a complete inline link may lead a refilled continuation line', () => {
    const r = reflowText(ownershipHead, { band: true });
    expect(r.output).toBe(ownershipBand);
    expect(r.changed).toBe(true);
    expect(r.output.split('\n')[2]).toBe(
      '[skill-lifecycle.md](references/skill-lifecycle.md) for the method,',
    );
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(verifyInvariants(ownershipHead, r.output)).toEqual([]);
    expect(reflowText(ownershipHead).changed).toBe(false);
  });
});
