import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import realMatter from 'gray-matter';
import * as realOkf from '../../../../utils/okf.js';
import * as realAtoms from '../../../../utils/quality-engine/atom/index.js';

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('node:crypto', () => realCrypto);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../okf.js', () => realOkf);
mock.module('./atoms.js', () => realAtoms);

const { atomIdOf, locateUnits, mergeDelta, parseDelta, verifyUnits } = await import(
  '../../../../utils/quality-engine/atom/delta.js'
);

const SOURCE = [
  '# Doc',
  '',
  '## Rules',
  '',
  'Always run the gate. Never skip the record step.',
  '',
  '- Keep receipts current.',
  '- Reflow to 100 columns.',
  '',
  '## Notes',
  '',
  'Always run the gate.',
  '',
].join('\n');

const atomOf = (text: string, headingPath: string[]) => ({
  behavioral: false,
  harmful: 0,
  helpful: 0,
  id: atomIdOf(text),
  placements: [{ headingPath }],
  precedence: 0,
  probeIds: ['p1'],
  status: 'active' as const,
  tags: [],
  textSha256: realAtoms.sha256Hex(realAtoms.normalizeText(text)),
});

const ref = (text: string, headingPath: string[]) => ({ atomId: atomIdOf(text), headingPath });

const MAP = {
  atoms: [
    atomOf('Always run the gate.', ['Doc', 'Rules']),
    atomOf('Never skip the record step.', ['Doc', 'Rules']),
    atomOf('- Keep receipts current.', ['Doc', 'Rules']),
  ],
  sensitivity: [],
  source: 'doc.md',
};

const RULES = ['Doc', 'Rules'];
const REASON = 'The rule was tightened to name the exact command.';

test('locates every unit with its exact character span', () => {
  const spans = locateUnits(SOURCE);
  const gate = spans.filter((span) => span.text === 'Always run the gate.');
  expect(gate.map((span) => SOURCE.slice(span.start, span.end))).toEqual([
    'Always run the gate.',
    'Always run the gate.',
  ]);
});

test('modify rewrites only the named span and keeps every other byte', () => {
  const result = mergeDelta(SOURCE, MAP, [
    {
      atom: ref('Never skip the record step.', RULES),
      op: 'modify',
      reason: REASON,
      text: 'Never skip the instruction-gate record step.',
    },
  ]);
  expect(result.text).toBe(
    SOURCE.replace('Never skip the record step.', 'Never skip the instruction-gate record step.'),
  );
  expect(result.retired).toEqual([
    { atomId: atomIdOf('Never skip the record step.'), reason: REASON },
  ]);
  expect(result.added).toEqual([atomIdOf('Never skip the instruction-gate record step.')]);
});

test('add inserts after the anchor, as a new line for a list item and inline for a sentence', () => {
  const inline = mergeDelta(SOURCE, MAP, [
    {
      after: ref('Never skip the record step.', RULES),
      op: 'add',
      text: 'Record after every edit.',
    },
  ]);
  expect(inline.text).toContain('Never skip the record step. Record after every edit.');
  const listed = mergeDelta(SOURCE, MAP, [
    { after: ref('- Keep receipts current.', RULES), op: 'add', text: '- Seal before commit.' },
  ]);
  expect(listed.text).toContain('- Keep receipts current.\n- Seal before commit.\n- Reflow');
});

test('retire removes a whole-line unit and its line break', () => {
  const result = mergeDelta(SOURCE, MAP, [
    { atom: ref('- Keep receipts current.', RULES), op: 'retire', reason: REASON },
  ]);
  expect(result.text).toBe(SOURCE.replace('- Keep receipts current.\n', ''));
  expect(result.retired).toHaveLength(1);
});

test('retire removes a mid-paragraph sentence with one adjoining space', () => {
  const result = mergeDelta(SOURCE, MAP, [
    { atom: ref('Never skip the record step.', RULES), op: 'retire', reason: REASON },
  ]);
  expect(result.text).toContain('\nAlways run the gate.\n\n- Keep');
});

test('move relocates the text without retiring the atom', () => {
  const result = mergeDelta(SOURCE, MAP, [
    {
      after: ref('- Keep receipts current.', RULES),
      atom: ref('Never skip the record step.', RULES),
      op: 'move',
    },
  ]);
  expect(result.retired).toEqual([]);
  expect(result.text).toContain('- Keep receipts current.\nNever skip the record step.');
});

test('tag ops are collected for the map and never touch the text', () => {
  const result = mergeDelta(SOURCE, MAP, [
    { atomId: atomIdOf('Always run the gate.'), counter: 'helpful', op: 'tag' },
    { atom: ref('- Keep receipts current.', RULES), op: 'retire', reason: REASON },
  ]);
  expect(result.tags).toEqual([{ atomId: atomIdOf('Always run the gate.'), counter: 'helpful' }]);
});

test('rejects a drifted anchor, an unknown atom, and a placement with no match', () => {
  const drift = (atom: { atomId: string; headingPath: string[] }) =>
    mergeDelta(SOURCE, MAP, [{ atom, op: 'retire', reason: REASON }]);
  expect(() => drift({ atomId: 'r-0000000000', headingPath: RULES })).toThrow('Anchor drift');
  expect(() => drift(ref('Always run the gate.', ['Doc', 'Elsewhere']))).toThrow('Anchor drift');
});

test('rejects overlapping ops and an op that shares a span with another', () => {
  expect(() =>
    mergeDelta(SOURCE, MAP, [
      { atom: ref('- Keep receipts current.', RULES), op: 'retire', reason: REASON },
      { atom: ref('- Keep receipts current.', RULES), op: 'retire', reason: REASON },
    ]),
  ).toThrow('same atom span');
});

test('rejects a retire or modify without a substantive reason', () => {
  expect(() =>
    mergeDelta(SOURCE, MAP, [
      { atom: ref('- Keep receipts current.', RULES), op: 'retire', reason: 'short' },
    ]),
  ).toThrow('reason');
});

test('rejects blank text, an empty delta, and an oversized delta', () => {
  expect(() =>
    mergeDelta(SOURCE, MAP, [
      { after: ref('- Keep receipts current.', RULES), op: 'add', text: ' padded ' },
    ]),
  ).toThrow('nonblank');
  expect(() => mergeDelta(SOURCE, MAP, [])).toThrow('1 to');
});

test('a retired atom cannot be a target', () => {
  const retired = {
    ...MAP,
    atoms: MAP.atoms.map((atom) => ({ ...atom, status: 'retired' as const })),
  };
  expect(() =>
    mergeDelta(SOURCE, retired, [
      { atom: ref('Always run the gate.', RULES), op: 'retire', reason: REASON },
    ]),
  ).toThrow('not an active atom');
});

test('verifyUnits rejects a merge that altered text outside the named spans', () => {
  const spans = locateUnits(SOURCE);
  expect(() => verifyUnits(SOURCE.replace('Always', 'ALWAYS'), spans, new Set(), [])).toThrow(
    'outside the named atom spans',
  );
  expect(() => verifyUnits(SOURCE, spans, new Set(), [])).not.toThrow();
});

test('locateUnits fails closed when a unit is not in the raw text', () => {
  expect(() =>
    locateUnits('plain text', () => [{ headingPath: [], text: 'absent words' }]),
  ).toThrow('could not be located');
});

test('retiring a lone paragraph collapses its blank line', () => {
  const source = '# D\n\n## R\n\nOne rule here.\n\nLone rule here.\n\nLast rule here.\n';
  const map = { ...MAP, atoms: [atomOf('Lone rule here.', ['D', 'R'])] };
  const result = mergeDelta(source, map, [
    { atom: ref('Lone rule here.', ['D', 'R']), op: 'retire', reason: REASON },
  ]);
  expect(result.text).toBe('# D\n\n## R\n\nOne rule here.\n\nLast rule here.\n');
});

test('retiring the first sentence of a line eats the space after it', () => {
  const result = mergeDelta(SOURCE, MAP, [
    { atom: ref('Always run the gate.', RULES), op: 'retire', reason: REASON },
  ]);
  expect(result.text).toContain('## Rules\n\nNever skip the record step.\n');
});

test('parseDelta accepts all five ops and rejects malformed ones', () => {
  const a = ref('Always run the gate.', RULES);
  const parsed = parseDelta({
    document: 'doc.md',
    ops: [
      { after: a, op: 'add', text: 't' },
      { atom: a, op: 'modify', reason: REASON, text: 't' },
      { after: a, atom: a, op: 'move' },
      { atom: a, op: 'retire', reason: REASON },
      { atomId: a.atomId, counter: 'harmful', op: 'tag' },
    ],
  });
  expect(parsed.ops.map((op) => op.op)).toEqual(['add', 'modify', 'move', 'retire', 'tag']);
  expect(() => parseDelta(null)).toThrow('document path');
  expect(() => parseDelta({ document: 'd', ops: [null] })).toThrow('must be an object');
  expect(() => parseDelta({ document: 'd', ops: [{ op: 'nope' }] })).toThrow('add, modify');
  expect(() =>
    parseDelta({ document: 'd', ops: [{ atomId: 'x', counter: 'z', op: 'tag' }] }),
  ).toThrow('helpful or harmful');
  expect(() => parseDelta({ document: 'd', ops: [{ after: {}, op: 'add', text: 't' }] })).toThrow(
    'atom reference',
  );
  expect(() => parseDelta({ document: 'd', ops: [{ after: a, op: 'add', text: 4 }] })).toThrow(
    'must be a string',
  );
});
