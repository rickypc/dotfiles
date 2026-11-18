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

const { CALIBRATION_ATOM_LIMIT, mutantsFor, negateSentence, selectAtoms } = await import(
  '../../../../utils/quality-engine/atom/mutate.js'
);

const hashOf = (text: string): string => realCrypto.createHash('sha256').update(text).digest('hex');

const atom = (id: string, overrides = {}) => ({
  behavioral: false,
  harmful: 0,
  helpful: 0,
  id,
  placements: [{ headingPath: ['A'] }],
  precedence: 0,
  probeIds: ['p1'],
  status: 'active' as const,
  tags: [],
  textSha256: hashOf(id),
  ...overrides,
});

test('selects active probed atoms in hash order of their id, up to the limit', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const atoms = [
    ...ids.map((id) => atom(id)),
    atom('retired', { status: 'retired' }),
    atom('unprobed', { probeIds: [] }),
  ];
  const expected = [...ids].sort((l, r) => (hashOf(l) < hashOf(r) ? -1 : 1));
  expect(selectAtoms(atoms, 3).map((a) => a.id)).toEqual(expected.slice(0, 3));
  expect(selectAtoms(atoms, 99).map((a) => a.id)).toEqual(expected);
  expect(CALIBRATION_ATOM_LIMIT).toBe(8);
});

test.each([
  ['The agent must stop.', 'The agent must not stop.'],
  ['The agent must not stop.', 'The agent must stop.'],
  ['It should stop.', 'It should not stop.'],
  ['It should not stop.', 'It should stop.'],
  ['Do not stop.', 'do stop.'],
  ['Never stop.', 'Always stop.'],
  ['It never stops.', 'It always stops.'],
  ['Always stop.', 'Never stop.'],
  ['It always stops.', 'It never stops.'],
])('negateSentence turns %j into %j', (sentence, expected) => {
  expect(negateSentence(sentence)).toBe(expected);
});

test('negateSentence returns nothing when no rule applies', () => {
  expect(negateSentence('The agent reads the file.')).toBeUndefined();
});

const kinds = (source: string, sentence: string) =>
  mutantsFor(source, sentence).map((m) => [m.kind, m.text]);

test('deletes and negates a sentence even when the source wraps it across lines', () => {
  const source = '# T\n\nFirst rule. The agent must\nalways answer in English. Last.\n';
  expect(kinds(source, 'The agent must always answer in English.')).toEqual([
    ['delete', '# T\n\nFirst rule.  Last.\n'],
    ['negate', '# T\n\nFirst rule. The agent must not always answer in English. Last.\n'],
  ]);
});

test('deletes every placement and keeps replacement text literal', () => {
  const source = 'Pay $& now. Other. Pay $& now.\n';
  expect(kinds(source, 'Pay $& now.')).toEqual([['delete', ' Other. \n']]);
  expect(kinds('It must cost $5. Again it must cost $5.', 'It must cost $5.')).toEqual([
    ['delete', ' Again it must cost $5.'],
    ['negate', 'It must not cost $5. Again it must cost $5.'],
  ]);
});

test('swaps an ordered step with the next one and keeps both numbers', () => {
  const source = '1. Read the file.\n   Check it twice.\n2. Write the report.\n3. Close.\n';
  expect(kinds(source, '1. Read the file. Check it twice.')).toEqual([
    ['delete', '\n2. Write the report.\n3. Close.\n'],
    ['swap', '1. Write the report.\n2. Read the file.\n   Check it twice.\n3. Close.\n'],
  ]);
  expect(kinds(source, '2. Write the report.').map(([kind]) => kind)).toEqual(['delete', 'swap']);
});

test('offers no swap for the last step, an unordered item, or a step before a non-step', () => {
  expect(kinds('1. First.\n2. Last.\n', '2. Last.').map(([kind]) => kind)).toEqual(['delete']);
  expect(kinds('- First.\n- Second.\n', '- First.').map(([kind]) => kind)).toEqual(['delete']);
  expect(kinds('1. First.\n\nPlain text.\n', '1. First.').map(([kind]) => kind)).toEqual([
    'delete',
  ]);
  expect(kinds('1. First.\n2. Second.', '1. First.').map(([kind]) => kind)).toEqual([
    'delete',
    'swap',
  ]);
});

test('offers no swap when the step does not start its line', () => {
  expect(kinds('Intro 1. First.\n2. Second.\n', '1. First.').map(([kind]) => kind)).toEqual([
    'delete',
  ]);
});

test('returns nothing when the sentence is absent from the source', () => {
  expect(mutantsFor('Some other text.', 'Missing sentence.')).toEqual([]);
});
