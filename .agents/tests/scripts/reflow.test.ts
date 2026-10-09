/**
 * reflow.ts scenario matrix - one named test per plan scenario (s1-s52).
 * Scope: shared-suite-integration - the SUT (scripts/reflow.ts) and its local
 * engine (utils/reflow.ts) stay real; every filesystem boundary is injected
 * or module-mocked. Corpus parity reads REFLOW_CORPUS_ROOT and skips with a
 * clear message when unset (no machine path is embedded here).
 */

import { describe, expect, mock, test } from 'bun:test';
import * as nodePath from 'node:path';
import { runWhenMainWithHelp } from '../../utils/cli.js';

// Snapshot the real path exports into a plain object before mock.module
// registration: Bun patches live module bindings, so a namespace reference
// inside the mock factory would resolve to the mock itself.
const realPathExports = { ...nodePath };
const realJoin: (...paths: string[]) => string = realPathExports.join;

const fsState: {
  dirs: string[];
  entries: Record<string, string[]>;
  throws: string[];
} = { dirs: [], entries: {}, throws: [] };
const cpState: { responses: { status: number; stdout: string }[] } = { responses: [] };

mock.module('node:fs/promises', () => ({
  readdir: mock(async (path: string) =>
    (fsState.entries[path] ?? []).map((name) => ({
      isDirectory: () => fsState.dirs.includes(`${path}/${name}`),
      isFile: () => !fsState.dirs.includes(`${path}/${name}`),
      name,
    })),
  ),
  readFile: mock(async (path: string) => {
    if (path === '/fixtures/defaults.md') {
      return 'This single paragraph line deliberately exceeds the one hundred column limit so the transform must wrap it now.\n';
    }
    if (path === '/fixtures/narrow.md') {
      return 'This is a narrow two line paragraph that the band mode\nmust refill into the wider band now.\n';
    }
    throw new Error(`ENOENT: ${path}`);
  }),
  stat: mock(async (path: string) => {
    if (fsState.throws.includes(path)) {
      throw new Error(`ENOENT: ${path}`);
    }
    return { isDirectory: () => fsState.dirs.includes(path) };
  }),
  writeFile: mock(async () => undefined),
}));

mock.module('node:child_process', () => ({
  spawnSync: mock(() => cpState.responses.shift() ?? { status: 1, stdout: '' }),
}));

mock.module('node:path', () => ({
  ...realPathExports,
  join: mock((...args: string[]) => realJoin(...args)),
}));

const { defaultReflowDeps, run, usage } = await import('../../scripts/reflow.js');
const { reflowText, residualOverLimitLines, verifyInvariants } = await import(
  '../../utils/reflow-file.js'
);

const makeDeps = (over: Partial<ReturnType<typeof defaultReflowDeps>> = {}) => ({
  log: mock(),
  read: mock(async (path: string) => {
    if (path === '/fixtures/defaults.md') {
      return 'This single paragraph line deliberately exceeds the one hundred column limit so the transform must wrap it now.\n';
    }
    throw new Error(`ENOENT: ${path}`);
  }),
  transform: (text: string) => reflowText(text),
  write: mock(async () => undefined),
  ...over,
});

const { tokenize, wrapAtoms } = await import('../../utils/reflow.js');

describe('wrap engine edges', () => {
  const options = { bandFloor: 80, width: 100 };

  test('an empty atom stream wraps to nothing at zero cost', () => {
    expect(wrapAtoms([], [], '', '', options)).toEqual({
      cost: 0,
      feasible: true,
      lines: [],
    });
  });

  test('an atom that fits no line makes the whole wrap infeasible', () => {
    expect(wrapAtoms(['x'.repeat(150)], [], '', '', options).feasible).toBe(false);
  });

  test('an atom stream whose only breaks are illegal stays infeasible', () => {
    const text = `In Buddhism, {${'x'.repeat(96)}} is`;
    const stream = tokenize(text);
    expect(wrapAtoms(stream.atoms, stream.seps, '', '', options).feasible).toBe(false);
  });

  test('a complete inline link may lead the only legal break', () => {
    const linkLead =
      '[human birth](https://en.wikipedia.org/wiki/Human_beings_in_Buddhism'
      + '#Qualities_of_human_life) is';
    const text = `In Buddhism, ${linkLead}`;
    const stream = tokenize(text);
    const r = wrapAtoms(stream.atoms, stream.seps, '', '', options);
    expect(r.feasible).toBe(true);
    expect(r.lines).toEqual(['In Buddhism,', linkLead]);
  });

  test('a glue separator is never a legal break, even when it is the only one', () => {
    const w = 'w'.repeat(93);
    const v = 'v'.repeat(95);
    const text = `${w} &nbsp; ${v}`;
    const r = reflowText(text);
    expect(r.changed).toBe(false);
    expect(r.output).toContain('&nbsp;');
    const stream = tokenize(text);
    expect(wrapAtoms(stream.atoms, stream.seps, '', '', options).feasible).toBe(false);
  });

  test('a bullet atom never begins a continuation line, even when it would fit', () => {
    const text =
      'In Buddhism the teaching of the [**Middle Way**](https://en.wikipedia.org/wiki/Middle_Way) (*Majjhimāpaṭipadā*) - a path between the extremes of indulgence and austerity as taught by the Buddha to his students here.';
    const r = reflowText(text);
    expect(r.changed).toBe(true);
    for (const line of r.output.split('\n').slice(1)) {
      expect(line.startsWith('- ')).toBe(false);
      expect(line.startsWith('-')).toBe(false);
    }
    expect(r.output).toBe(
      'In Buddhism the teaching of the [**Middle Way**](https://en.wikipedia.org/wiki/Middle_Way)\n(*Majjhimāpaṭipadā*) - a path between the extremes of indulgence and austerity as taught by the\nBuddha to his students here.',
    );
    expect(r.residuals).toEqual([]);
  });

  test('a whitespace-only marker line has no wrappable content and stays authored', () => {
    const r = reflowText(`- ${'\u00A0'.repeat(100)}`);
    expect(r.changed).toBe(false);
    expect(r.residuals[0]?.reason).toBe('unbreakable-atom-in-context');
  });

  test('construct scanners cover unclosed brackets, dead tags, quotes, and nesting', () => {
    const unclosed = tokenize('an [unclosed bracket stays');
    expect(unclosed.atoms).toContain('[unclosed');
    const deadTag = tokenize('a </ b comparison and an < ordinary sign');
    expect(deadTag.atoms).toContain('</');
    expect(deadTag.atoms).toContain('<');
    const quoted = tokenize('He said "quoted span here" and more');
    expect(quoted.atoms).toContain('"quoted span here"');
    const nested = tokenize('see [[nested note]] inside');
    expect(nested.atoms).toContain('[[nested note]]');
  });
});

describe('scenario matrix', () => {
  test('s1: prose over the limit splits; continuations land in the band', () => {
    const r = reflowText(
      'This paragraph is deliberately made long enough to exceed one hundred characters so that the wrap must split it into the band now.',
    );
    expect(r.output).toBe(
      'This paragraph is deliberately made long enough to exceed one hundred characters so that the wrap\nmust split it into the band now.',
    );
  });

  test('s2: a block with no over-limit line stays byte-identical even when narrow', () => {
    const text =
      'A wrapped line here is quite\nshort and must stay exactly as authored because no line runs over the limit at all here.';
    const r = reflowText(text);
    expect(r.changed).toBe(false);
    expect(r.output).toBe(text);
    expect(r.residuals).toEqual([]);
  });

  test('s3: a block already fully in the band is byte-identical', () => {
    const text =
      'A compliant wrapped paragraph occupies the whole width of the permitted band in its first line\nand finishes with this short tail.';
    expect(reflowText(text).changed).toBe(false);
  });

  test('s4: list marker stripped before the split; continuation aligns; no duplicate marker', () => {
    const r = reflowText(
      '- **Checking your intention:** is it rooted in kindness, clarity, or craving when you examine the motivation before you act on it here now?\n\nTrailing paragraph that stays outside the list and keeps its own compliant wrap here.',
    );
    expect(r.output).toBe(
      '- **Checking your intention:** is it rooted in kindness, clarity, or craving when you examine the\n  motivation before you act on it here now?\n\nTrailing paragraph that stays outside the list and keeps its own compliant wrap here.',
    );
    const adjacentBullets =
      '   Use a screwdriver or similar tool to remove the leftover resin inside the statue fully.\n   - Unblock the neck\n   - Smooth the hole\n';
    const kept = reflowText(adjacentBullets);
    expect(kept.output).toContain('\n   - Unblock the neck\n   - Smooth the hole');
  });

  test('s5: a deeper authored continuation indent is preserved', () => {
    const r = reflowText(
      '- An item whose authored continuation uses a deeper indent that must survive the refill completely unchanged here now:\n     aligned continuation text stays on its authored deeper indent.',
    );
    expect(r.output).toBe(
      '- An item whose authored continuation uses a deeper indent that must survive the refill completely\n     unchanged here now: aligned continuation text stays on its authored deeper indent.',
    );
  });

  test('s6: enumerated blockquote item keeps > on every line with aligned continuation', () => {
    const r = reflowText(
      '> 1. An enumerated blockquote item with text long enough to need wrapping keeps its quote marker on every line.\n>    aligned continuation under the item content stays quoted as required by the rule.',
    );
    expect(r.output).toBe(
      '> 1. An enumerated blockquote item with text long enough to need wrapping keeps its quote marker on\n>   every line. aligned continuation under the item content stays quoted as required by the rule.',
    );
    const preamble =
      '> preamble line before the item stays quoted\n> 1. the item text itself stays quoted too';
    expect(reflowText(preamble).changed).toBe(false);
    const single =
      '> 1. An enumerated blockquote item authored as one long line over one hundred characters that must wrap now.';
    const wrapped = reflowText(single);
    expect(wrapped.changed).toBe(true);
    expect(verifyInvariants(single, wrapped.output)).toEqual([]);
    for (const line of wrapped.output.split('\n')) {
      expect([...line].length).toBeLessThanOrEqual(100);
      expect(line.startsWith('> ')).toBe(true);
    }
  });
});

describe('scenario matrix: atoms and links', () => {
  test('s7: verse and lazy blockquotes without reflowable shape stay untouched', () => {
    const verse =
      '> Khippataraṁ kho so, bhikkhave, kāṇo kacchapo vassasatassa vassasatassa accayena sakiṁ sakiṁ\n> ummujjanto amusmiṁ ekacchiggale yuge gīvaṁ paveseyya.';
    expect(reflowText(verse).changed).toBe(false);
    const lazy =
      '> 1. A lazy blockquote item keeps its lazy continuation\n     untouched because re-emitting a lazy region is not deterministic.\n\n     continued after an inner blank line';
    const lazyResult = reflowText(lazy);
    expect(lazyResult.changed).toBe(false);
    const adjacent =
      '> verse line that stops at plain prose\nplain prose at base indent follows immediately';
    expect(reflowText(adjacent).changed).toBe(false);
  });

  test('s8: inline code span with spaces is atomic', () => {
    const r = reflowText(
      'A sentence with a long code span `SELECT meaning FROM table WHERE column IS NOT NULL` that must stay atomic while wrapping long lines of text here.',
    );
    expect(r.output).toBe(
      'A sentence with a long code span `SELECT meaning FROM table WHERE column IS NOT NULL` that must stay\natomic while wrapping long lines of text here.',
    );
  });

  test('s9: markdown link is atomic and its target survives', () => {
    const r = reflowText(
      'Words [dependent origination](https://en.wikipedia.org/wiki/Prat%C4%ABtyasamutp%C4%81da) continue after the atomic link with enough extra text to force a wrapped second line in the band.',
    );
    expect(r.output).toContain(
      '[dependent origination](https://en.wikipedia.org/wiki/Prat%C4%ABtyasamutp%C4%81da)',
    );
    expect(r.output).toBe(
      'Words [dependent origination](https://en.wikipedia.org/wiki/Prat%C4%ABtyasamutp%C4%81da) continue\nafter the atomic link with enough extra text to force a wrapped second line in the band.',
    );
  });

  test('s10: reference link and bare label link survive', () => {
    const text =
      'A paragraph with a reference link [label][ref-1] and a bare [ref-1] citation label both survive the reflow completely intact now.\n\n[ref-1]: https://example.com/a-very-long-reference-target-url-that-stays-untouched';
    const r = reflowText(text);
    expect(r.output).toContain('[label][ref-1]');
    expect(r.output).toContain('a bare [ref-1] citation');
    expect(r.output).toContain(
      '[ref-1]: https://example.com/a-very-long-reference-target-url-that-stays-untouched',
    );
  });

  test('s11: a break before an inline JSX element emits one nbsp and never duplicates it', () => {
    const r = reflowText(
      'This introductory text is crafted to fill the width of the first line almost completely before <Tag attr="value">paired content</Tag> which begins the continuation line receiving one nbsp.',
    );
    expect(r.output).toBe(
      'This introductory text is crafted to fill the width of the first line almost completely before\n&nbsp;<Tag attr="value">paired content</Tag> which begins the continuation line receiving one nbsp.',
    );
    expect(reflowText(r.output).changed).toBe(false);
    const glued = reflowText(
      'One&nbsp;two three&nbsp;four are glued pairs that must never break at the non-breaking space while the wrap arranges all the other words into the required band here.',
    );
    expect(glued.output).toContain('One&nbsp;two');
    expect(glued.output).toContain('three&nbsp;four');
  });

  test('s12: balanced brace expression keeps its depth and is never joined into prose', () => {
    const r = reflowText(
      'A paragraph with a balanced expression { answer > 40 ? "large" : "small" } that keeps its depth and is never joined into prose lines while wrapping here.',
    );
    expect(r.output).toContain('{ answer > 40 ? "large" : "small" }');
    const comparison =
      'A comparison like a < b inside a longer sentence keeps the bare less-than sign as its own atom while the rest wraps into the compliant band.';
    expect(reflowText(comparison).output).toContain('a < b');
  });
});

describe('scenario matrix: protected structures', () => {
  test('s13: JSX-only lines and comment blocks are verbatim', () => {
    const text =
      '<Metadata />\n\n{/*\n  a comment block\n*/}\n\n<Phrase\n  instruction="a quoted value"\n  {...phrase}\n/>\n\nText with a split tag </div\n> done\n\nThe mantra is: <code>{\n  phrase.children\n    .replace(/x/, "y")\n}</code>\n\nA paragraph that is long enough to be wrapped into the compliant band by the transform during this test run.';
    const r = reflowText(text);
    expect(r.output).toContain('<Metadata />\n\n{/*\n  a comment block\n*/}');
    expect(r.output).toContain('<Phrase\n  instruction="a quoted value"\n  {...phrase}\n/>');
    expect(r.output).toContain('Text with a split tag </div\n> done');
    expect(r.output).toContain(
      'The mantra is: <code>{\n  phrase.children\n    .replace(/x/, "y")\n}</code>',
    );
    expect(r.output).toContain(
      'A paragraph that is long enough to be wrapped into the compliant band by the transform during this\ntest run.',
    );
  });

  test('s14: a markdown-context break is allowed only with balanced tags after it', () => {
    const r = reflowText(
      'A long paragraph containing an inline <em>emphasis pair</em> that must never allow a break between the opening and the closing tag during wrap.',
    );
    expect(r.output).toContain('<em>emphasis pair</em>');
    expect(r.output).toBe(
      'A long paragraph containing an inline <em>emphasis pair</em> that must never allow a break between\nthe opening and the closing tag during wrap.',
    );
  });

  test('s15: no continuation begins with an ordered marker, >, #, [, {, or a JSX tag', () => {
    const r = reflowText(
      'An ordinary paragraph with enough words to wrap onto several lines where forbidden tokens appear at safe inner positions like the number 3. here and a [bracketed] mention too.',
    );
    const lines = r.output.split('\n').slice(1);
    for (const line of lines) {
      expect(['#', '>', '[', '{'].includes(line[0] ?? '')).toBe(false);
      expect(/^\d{1,9}[.)](\s|$)/.test(line)).toBe(false);
      expect(/^<[A-Za-z]/.test(line)).toBe(false);
    }
    expect(r.output).toBe(
      'An ordinary paragraph with enough words to wrap onto several lines where forbidden tokens appear at\nsafe inner positions like the number 3. here and a [bracketed] mention too.',
    );
  });

  test('s16: footnote definitions with aligned continuations stay byte-identical', () => {
    const text =
      'Text with a footnote reference here.[^10]\n\n[^10]: A footnote label whose continuation lines are indented to align under\n       the label text itself so each chunk keeps its own line exactly.\n\n[^1000]: A wider label whose continuation alignment shifts by the wider marker and stays verbatim.\n         wider continuation chunk';
    expect(reflowText(text).changed).toBe(false);
  });

  test('s17: the em Source citation line is verbatim', () => {
    const r = reflowText(
      'Intro paragraph that is long enough to be wrapped into the compliant band by the transform during this test run here.\n\n    <em>Source: [Example Source](https://example.com/very-long-source-url) - Example</em>',
    );
    expect(r.output).toContain(
      '<em>Source: [Example Source](https://example.com/very-long-source-url) - Example</em>',
    );
  });
});

describe('scenario matrix: exempt structures', () => {
  test('s18: frontmatter keeps delimiters, arrays, and scalar values verbatim', () => {
    const r = reflowText(
      '---\ndescription: >-\n  A short narrow line\n  and the refillable block scalar content.\n\n  second scalar paragraph after a blank\n\nkeywords: [\n  alpha,\n  beta,\n]\ntags: [one, two]\ntitle: Test\n---\n\nBody paragraph that is long enough to be wrapped into the compliant eighty-one column band by the tool.',
    );
    expect(r.output).toContain(
      '---\ndescription: >-\n  A short narrow line\n  and the refillable block scalar content.\n\n  second scalar paragraph after a blank\n\nkeywords: [\n  alpha,\n  beta,\n]\ntags: [one, two]\ntitle: Test\n---',
    );
    expect(r.output).toContain(
      'Body paragraph that is long enough to be wrapped into the compliant eighty-one column band by the\ntool.',
    );
    const malformed = '---\nnever closed frontmatter\n\nBody text stays as-is.';
    expect(reflowText(malformed).changed).toBe(false);
  });

  test('s19: fenced code including a longer closing fence is verbatim', () => {
    const text =
      'Text before the fence is long enough to be wrapped into the compliant band by the deterministic transform tool here.\n\n```\ncode stays exactly as written even when    very    long and  spaced\n````\nclosed by a longer fence\n````\n\nAfter fence text that is long enough to be wrapped into the compliant band by the tool again.';
    const r = reflowText(text);
    expect(r.output).toContain(
      '```\ncode stays exactly as written even when    very    long and  spaced\n````\nclosed by a longer fence\n````',
    );
    expect(r.output).toContain(
      'After fence text that is long enough to be wrapped into the compliant band by the tool again.',
    );
  });

  test('s20: ATX heading, including one over the limit, is verbatim', () => {
    const text =
      '## A heading that is deliberately made longer than one hundred characters so the rule must leave it exactly verbatim without a refill at all\n\nBody paragraph that is long enough to be wrapped into the compliant band by the transform here.';
    const r = reflowText(text);
    expect(r.output).toContain(
      '## A heading that is deliberately made longer than one hundred characters so the rule must leave it exactly verbatim without a refill at all',
    );
  });

  test('s21: import statements and catalog-style exempt lines are verbatim', () => {
    const text =
      "import Something from '#buddhism/practice-daily-life/phrases/_a_rather_long_import_path_that_exceeds';\n\nBody paragraph that is long enough to be wrapped into the compliant band by the transform tool.";
    const r = reflowText(text);
    expect(r.output).toContain(
      "import Something from '#buddhism/practice-daily-life/phrases/_a_rather_long_import_path_that_exceeds';",
    );
  });

  test('s22: table row and delimiter row are verbatim', () => {
    const text =
      'Text before the table is long enough to be wrapped into the compliant band by the deterministic transform here.\n\n| Column | Another |\n| --- | --- |\n| a cell | another cell that is very long and over one hundred characters in this table row which stays verbatim |';
    const r = reflowText(text);
    expect(r.output).toContain('| Column | Another |\n| --- | --- |');
    expect(r.output).toContain(
      '| a cell | another cell that is very long and over one hundred characters in this table row which stays verbatim |',
    );
  });

  test('s23: admonition fence and thematic break are verbatim', () => {
    const text =
      'Text before the admonition is long enough to be wrapped into the compliant band by the tool.\n\n:::note\nAn admonition fence and its content stay verbatim.\n:::\n\nAfter the admonition, a paragraph that is long enough to be wrapped into the compliant band by the tool.';
    const r = reflowText(text);
    expect(r.output).toContain(':::note\nAn admonition fence and its content stay verbatim.\n:::');
    expect(reflowText('Body text.\n\n---\n\nMore body text.').changed).toBe(false);
  });
});

describe('scenario matrix: net gain and structure', () => {
  test('s24: a block whose only overflow is an unbreakable token is left alone', () => {
    const text =
      'A paragraph whose only overflow is one unbreakable token https://example.com/a-really-extremely-long-single-token-url-target-that-exceeds-the-limit-here-in-this-doc stays alone.';
    const r = reflowText(text);
    expect(r.changed).toBe(false);
    expect(r.residuals).toHaveLength(1);
    expect(r.residuals[0]?.reason).toBe('unbreakable-atom-in-context');
  });

  test('s25: a compliant multi-line block is untouched; an over-limit list item refills', () => {
    const equal =
      'The Buddha emphasized that [truth](https://en.wikipedia.org/wiki/Reality_in_Buddhism) is not\nsomething we inherit from tradition or accept because an authority claims it. Truth becomes\nmeaningful only when it is confirmed through our own\n**[direct experience](https://en.wikisource.org/wiki/Translation:Dhammapada/Chapter_6)**.';
    const r = reflowText(equal);
    expect(r.changed).toBe(false);
    expect(r.residuals).toEqual([]);
    const gain =
      '- **Example:** _Ārya Tārā_ <code>{somePhrase.transliteration.children}</code> is an example list item made long enough to overflow here by far';
    const refilled = reflowText(gain);
    expect(refilled.changed).toBe(true);
  });

  test('s26: trailing two-space break and trailing backslash are preserved', () => {
    const text =
      'A paragraph line ending with a hard break  \nand the next line continues after the two-space break marker that must be preserved exactly.\n\nA paragraph with a trailing backslash\\\nthat keeps the backslash line verbatim too.';
    expect(reflowText(text).changed).toBe(false);
  });

  test('s27: CRLF line endings are preserved while over-limit paragraphs refill', () => {
    const r = reflowText(
      'A wrapped line here is quite short and needs to be widened into the required band by the transform tool in this fixture right now.\r\n\r\nSecond paragraph that is also long enough to be wrapped into the compliant eighty-one column band by the tool.\r\n',
    );
    expect(r.output).toBe(
      'A wrapped line here is quite short and needs to be widened into the required band by the transform\r\ntool in this fixture right now.\r\n\r\nSecond paragraph that is also long enough to be wrapped into the compliant eighty-one column band by\r\nthe tool.\r\n',
    );
    expect(reflowText('No trailing newline here at all.').changed).toBe(false);
  });

  test('s28: a second pass over the tool output is a byte-identical no-op', () => {
    const text =
      'A paragraph that runs past one hundred columns on purpose so the deterministic transform must wrap it into the required shape now.\n\n- **First item:** a list item with continuation text that together overflow the one hundred column limit by a wide margin here';
    const first = reflowText(text);
    expect(first.changed).toBe(true);
    const second = reflowText(first.output);
    expect(second.changed).toBe(false);
    expect(second.output).toBe(first.output);
  });

  test('s33: a feasible wrap that cannot fill the band is kept as authored', () => {
    const mala =
      "For each bead, say your mantra once. For example: <code>{aryaTaraPhrase.transliteration.children}</code>\n({aryaTaraPhrase.transliteration.title.replace(/ Hṛdaya/, '')} mantra)";
    const r = reflowText(mala);
    expect(r.changed).toBe(false);
    expect(r.residuals).toHaveLength(1);
    expect(r.residuals[0]?.reason).toBe('band-refill-not-possible');
    const tara =
      '- **Example:** _Ārya Tārā (Green Tārā Mantra)_ <code>{aryaTaraPhrase.transliteration.children}</code>';
    const kept = reflowText(tara);
    expect(kept.changed).toBe(false);
    expect(kept.residuals[0]?.reason).toBe('band-refill-not-possible');
  });
});

describe('band mode', () => {
  test('s36: band mode refills a below-band wrapped paragraph into the band', () => {
    const text =
      'Verify selected-path lint and TypeScript declaration-order behavior without\n'
      + 'target configuration changes or semantic edits. Verify that barriers and\n'
      + 'cycles are reported rather than crossed.';
    expect(reflowText(text).changed).toBe(false);
    const r = reflowText(text, { band: true });
    expect(r.changed).toBe(true);
    expect(r.residuals).toEqual([]);
    expect(verifyInvariants(text, r.output)).toEqual([]);
    const lines = r.output.split('\n');
    for (const line of lines.slice(0, -1)) {
      expect([...line].length).toBeGreaterThan(80);
      expect([...line].length).toBeLessThanOrEqual(100);
    }
    const second = reflowText(r.output, { band: true });
    expect(second.changed).toBe(false);
    expect(second.output).toBe(r.output);
  });

  test('s37: band mode refills an in-band paragraph that is not max-filled', () => {
    const text =
      'A compliant wrapped paragraph occupies the whole width of the permitted band in its first line\n'
      + 'and finishes with this short tail.';
    const r = reflowText(text, { band: true });
    expect(r.output).toBe(
      'A compliant wrapped paragraph occupies the whole width of the permitted band in its first line and\n'
        + 'finishes with this short tail.',
    );
    expect(verifyInvariants(text, r.output)).toEqual([]);
    expect(reflowText(r.output, { band: true }).changed).toBe(false);
    expect(reflowText(text).changed).toBe(false);
  });

  test('s38: band mode leaves a single-line short paragraph authored', () => {
    const text = 'A short single-line paragraph stays exactly as authored here.';
    const r = reflowText(text, { band: true });
    expect(r.changed).toBe(false);
    expect(r.residuals).toEqual([]);
  });

  test('s39: band mode keeps block-scalar frontmatter verbatim while refilling the body', () => {
    const text =
      '---\ndescription: >-\n  A short narrow line\n  and more narrow scalar content.\ntitle: Test\n---\n'
      + '\nNarrow body paragraph wrapped under the band\nfloor that must refill now.';
    const r = reflowText(text, { band: true });
    expect(r.changed).toBe(true);
    expect(r.output).toContain(
      '---\ndescription: >-\n  A short narrow line\n  and more narrow scalar content.\ntitle: Test\n---',
    );
    expect(r.output).toContain(
      'Narrow body paragraph wrapped under the band floor that must refill now.',
    );
    expect(verifyInvariants(text, r.output)).toEqual([]);
  });

  test('s40: band mode keeps a two-atom block whose authored shape is already max-fill', () => {
    const text = `${'a'.repeat(50)}\n${'b'.repeat(55)}`;
    const plain = reflowText(text);
    expect(plain.changed).toBe(false);
    expect(plain.residuals).toEqual([]);
    const r = reflowText(text, { band: true });
    expect(r.changed).toBe(false);
    expect(r.output).toBe(text);
    expect(r.residuals).toEqual([]);
  });

  test('s41: band mode refills list and quote items with their prefixes preserved', () => {
    const list =
      '- **Checking your intention:** is it rooted in kindness,\n'
      + '  clarity, or craving when you examine the motivation before\n'
      + '  you act on it here now?';
    const listResult = reflowText(list, { band: true });
    expect(listResult.changed).toBe(true);
    expect(listResult.residuals).toEqual([]);
    expect(listResult.output).toContain('**Checking your intention:**');
    const listLines = listResult.output.split('\n');
    expect(listLines[0]?.startsWith('- **Checking your intention:**')).toBe(true);
    for (const line of listLines.slice(1)) {
      expect(line.startsWith('  ')).toBe(true);
    }
    expect(verifyInvariants(list, listResult.output)).toEqual([]);
    expect(reflowText(listResult.output, { band: true }).changed).toBe(false);
    const quote =
      '> 1. An enumerated item wrapped narrow under the band\n>    floor on purpose so band mode must refill it.';
    const quoteResult = reflowText(quote, { band: true });
    expect(quoteResult.changed).toBe(true);
    for (const line of quoteResult.output.split('\n')) {
      expect(line.startsWith('> ')).toBe(true);
      expect([...line].length).toBeLessThanOrEqual(100);
    }
    expect(verifyInvariants(quote, quoteResult.output)).toEqual([]);
  });
});

describe('band CLI plumbing', () => {
  test('s42: the --band flag plumbs band mode through the CLI transform', async () => {
    const narrow =
      'This is a narrow two line paragraph that the band mode\nmust refill into the wider band now.';
    expect(defaultReflowDeps(true).transform(narrow).changed).toBe(true);
    expect(defaultReflowDeps(true).transform(narrow).output).toBe(
      'This is a narrow two line paragraph that the band mode must refill into the wider band now.',
    );
    expect(defaultReflowDeps().transform(narrow).changed).toBe(false);
    expect(usage()).toContain('--band');
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(String(args[0]));
    };
    let withBand: number;
    let withoutBand: number;
    try {
      withBand = await run(['/fixtures/narrow.md', '--band']);
      withoutBand = await run(['/fixtures/narrow.md']);
    } finally {
      console.log = original;
    }
    expect(withBand).toBe(0);
    expect(withoutBand).toBe(0);
    expect(logs.join('\n')).toContain('changed=1');
    expect(logs.join('\n')).toContain('changed=0');
  });
});

describe('cli contract', () => {
  test('s29: an invariant change exits non-zero and writes nothing', async () => {
    const deps = makeDeps({
      read: mock(
        async () => 'Original text that a corrupted transform will mangle during the run.',
      ),
      transform: (text: string) => ({
        changed: true,
        output: text.replace('Original', 'Mutated'),
        residuals: [],
      }),
    });
    const code = await run(['/fixtures/defaults.md'], deps);
    expect(code).toBe(1);
    expect(deps.write).not.toHaveBeenCalled();
  });

  test('s30: a residual non-exempt over-limit line exits non-zero and writes nothing', async () => {
    const long =
      'An ordinary prose line that is deliberately kept over one hundred characters so the residual check must reject it here.';
    const deps = makeDeps({
      read: mock(async () => `${long}${long}`),
      transform: (text: string) => ({ changed: false, output: text, residuals: [] }),
    });
    const code = await run(['/fixtures/stuck.md'], deps);
    expect(code).toBe(1);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('abort'));
    expect(deps.write).not.toHaveBeenCalled();
    const options = { bandFloor: 80, width: 100 };
    expect(residualOverLimitLines(`${long}${long}`, options)).toHaveLength(1);
    expect(residualOverLimitLines('- \n\nplain body text', options)).toEqual([]);
  });

  test('s31: dry run writes nothing; --write writes; --report prints classes; --help is inert', async () => {
    const path = '/fixtures/defaults.md';
    const dry = makeDeps();
    const dryCode = await run([path], dry);
    expect(dryCode).toBe(0);
    expect(dry.write).not.toHaveBeenCalled();
    expect(dry.log).toHaveBeenCalledWith(expect.stringContaining('changed=1'));

    const wet = makeDeps();
    const wetCode = await run([path, '--write'], wet);
    expect(wetCode).toBe(0);
    expect(wet.write).toHaveBeenCalledTimes(1);

    const reportDeps = makeDeps({
      read: mock(
        async () =>
          'A paragraph whose only overflow is one unbreakable token https://example.com/a-really-extremely-long-single-token-url-target-that-exceeds-the-limit-here-in-this-doc stays.\n',
      ),
    });
    const reportCode = await run([path, '--report'], reportDeps);
    expect(reportCode).toBe(0);
    expect(reportDeps.log).toHaveBeenCalledWith(expect.stringContaining('[reflow] residual'));
    expect(reportDeps.log).toHaveBeenCalledWith(expect.stringContaining('[reflow] over100'));

    const helpWrite = mock();
    runWhenMainWithHelp(true, ['--help'], usage, mock(), helpWrite);
    expect(helpWrite).toHaveBeenCalledWith(usage());
  });

  test('s32: one aborted document does not hide the report for the others', async () => {
    const deps = makeDeps({
      read: mock(async (path: string) => {
        if (path === '/fixtures/good.md') {
          return 'This single paragraph line deliberately exceeds the one hundred column limit so the transform must wrap it now.\n';
        }
        throw new Error('ENOENT');
      }),
    });
    const code = await run(['/fixtures/good.md', '/fixtures/missing.md'], deps);
    expect(code).toBe(1);
    expect(deps.log).toHaveBeenCalledWith(
      expect.stringContaining('[reflow] unreadable: /fixtures/missing.md'),
    );
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('/fixtures/good.md'));
  });

  test('default deps read from the mocked filesystem boundary and log to a spied console', async () => {
    const deps = defaultReflowDeps();
    const text = await deps.read('/fixtures/defaults.md');
    expect(text).toContain('deliberately exceeds');
    const original = console.log;
    console.log = () => undefined;
    try {
      deps.log('captured');
    } finally {
      console.log = original;
    }
    expect(deps.transform(text).changed).toBe(true);
    await deps.write('/fixtures/defaults.md', text);
    expect(run(['--unknown-flag'])).resolves.toBe(2);
  });

  test('verifyInvariants names each failed invariant', () => {
    expect(verifyInvariants('a b c', 'a b c')).toEqual([]);
    expect(verifyInvariants('a b c', 'a c b')).toContain('ordered atom list changed');
    expect(verifyInvariants('a [x](u1) b', 'a [x](u2) b')).toContain(
      'link-target multiset changed',
    );
    expect(verifyInvariants('a b', 'a')).toContain('whitespace-normalized text changed');
  });
});

describe('cli walk contract', () => {
  test('s34: a directory walk collects markdown and skips junk dirs when git is absent', async () => {
    fsState.dirs = ['/proj', '/proj/docs', '/proj/node_modules', '/proj/build'];
    fsState.entries = {
      '/proj': ['AGENTS.md', 'build', 'docs', 'node_modules', 'skip.txt'],
      '/proj/build': ['out.md'],
      '/proj/docs': ['page.mdx'],
      '/proj/node_modules': ['dep.md'],
    };
    const deps = makeDeps({
      read: mock(async (path: string) => {
        if (path === '/proj/AGENTS.md' || path === '/proj/docs/page.mdx') {
          return 'A paragraph that runs past one hundred columns on purpose so the deterministic transform must wrap it into the required shape now.\n';
        }
        throw new Error(`ENOENT: ${path}`);
      }),
    });
    const code = await run(['/proj'], deps);
    expect(code).toBe(0);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('files=2 changed=2 aborted=0'));
    fsState.dirs = [];
    fsState.entries = {};
  });

  test('s35: inside a work tree the file list comes from git and skips ignored paths', async () => {
    fsState.dirs = ['/proj'];
    cpState.responses = [
      { status: 0, stdout: 'true\n' },
      { status: 0, stdout: 'AGENTS.md\0docs/page.mdx\0' },
    ];
    const deps = makeDeps({
      read: mock(async (path: string) => {
        if (path === '/proj/AGENTS.md' || path === '/proj/docs/page.mdx') {
          return 'A paragraph that runs past one hundred columns on purpose so the deterministic transform must wrap it into the required shape now.\n';
        }
        throw new Error(`ENOENT: ${path}`);
      }),
    });
    const code = await run(['/proj'], deps);
    expect(code).toBe(0);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('files=2 changed=2 aborted=0'));
    cpState.responses = [];
    fsState.dirs = [];
  });

  test('a failed git listing falls back to the raw directory walk', async () => {
    fsState.dirs = ['/proj', '/proj/docs'];
    fsState.entries = { '/proj': ['docs'], '/proj/docs': ['page.mdx'] };
    cpState.responses = [
      { status: 0, stdout: 'true\n' },
      { status: 1, stdout: '' },
    ];
    const deps = makeDeps({
      read: mock(async (path: string) => {
        if (path === '/proj/docs/page.mdx') {
          return 'A paragraph that runs past one hundred columns on purpose so the deterministic transform must wrap it into the required shape now.\n';
        }
        throw new Error(`ENOENT: ${path}`);
      }),
    });
    const code = await run(['/proj'], deps);
    expect(code).toBe(0);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('files=1 changed=1 aborted=0'));
    cpState.responses = [];
    fsState.dirs = [];
    fsState.entries = {};
  });

  test('a path that cannot be stat-ed falls through and is reported unreadable', async () => {
    fsState.throws = ['/proj/missing'];
    const deps = makeDeps();
    const code = await run(['/proj/missing'], deps);
    expect(code).toBe(1);
    expect(deps.log).toHaveBeenCalledWith(
      expect.stringContaining('[reflow] unreadable: /proj/missing'),
    );
    fsState.throws = [];
  });
});

describe('corpus parity', () => {
  const corpusRoot = Bun.env.REFLOW_CORPUS_ROOT;
  test.skipIf(corpusRoot === undefined)(
    'the corpus is a byte-identical fixed point and every pass is idempotent',
    async () => {
      const files = (await Array.fromAsync(new Bun.Glob('**/*.mdx').scan({ cwd: corpusRoot })))
        .filter(
          (f) =>
            !f.startsWith('node_modules/')
            && !f.startsWith('supports/')
            && !f.startsWith('build/')
            && !f.startsWith('.docusaurus/'),
        )
        .sort();
      const changed: string[] = [];
      for (const file of files) {
        const text = await Bun.file(`${corpusRoot}/${file}`).text();
        const result = reflowText(text);
        const second = reflowText(result.output);
        expect(second.changed).toBe(false);
        expect(second.output).toBe(result.output);
        if (result.changed) {
          changed.push(file);
        }
      }
      expect(files).toHaveLength(113);
      expect(changed).toEqual([]);
    },
  );
});
