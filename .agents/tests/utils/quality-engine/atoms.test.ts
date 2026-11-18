import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import realMatter from 'gray-matter';
import * as realOkf from '../../../utils/okf.js';

// gray-matter is registered as its real implementation so every same-process consumer sees an
// identical module and no divergent double can leak across test files.
mock.module('node:crypto', () => realCrypto);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../okf.js', () => realOkf);

const {
  ATOM_SCHEMA_VERSION,
  checkAtoms,
  normalizeText,
  parseAtomCheckPolicy,
  parseAtomMap,
  sha256Hex,
  shingleSimilarity,
  sourceBlocks,
  sourceUnits,
} = await import('../../../utils/quality-engine/atoms.js');

const hash = 'a'.repeat(64);
const atom = {
  behavioral: false,
  harmful: 0,
  helpful: 1,
  id: 'scope-1',
  placements: [{ headingPath: ['Rules', 'Scope'] }],
  precedence: 0,
  probeIds: ['train-01'],
  status: 'active' as const,
  tags: ['scope'],
  textSha256: hash,
};
const base: Record<string, unknown> = {
  atoms: [atom],
  description: 'Atoms for one document.',
  schemaVersion: 1,
  source: 'skills/demo/SKILL.md',
  tags: ['atoms'],
  title: 'Demo atoms',
  type: 'atom-map',
};
const mapOf = (overrides: Record<string, unknown>): string => {
  const fields = { ...base, ...overrides };
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join('\n')}\n---\nbody\n`;
};

test('parses a valid atom map and defaults sensitivity to empty', () => {
  expect(ATOM_SCHEMA_VERSION).toBe(1);
  expect(parseAtomMap(mapOf({}))).toEqual({
    atoms: [atom],
    sensitivity: [],
    source: 'skills/demo/SKILL.md',
  });
});

test('parses sensitivity records and retired atoms', () => {
  const sensitivity = [{ mutantsFlipped: 1, mutantsTried: 3, probeId: 'train-01' }];
  const retired = { ...atom, id: 'scope-2', status: 'retired' };
  const parsed = parseAtomMap(mapOf({ atoms: [atom, retired], sensitivity }));
  expect(parsed.sensitivity).toEqual(sensitivity);
  expect(parsed.atoms.map((entry) => entry.status)).toEqual(['active', 'retired']);
});

test.each([
  ['unknown top-level field', { extra: 1 }, 'unknown field'],
  ['wrong type', { type: 'concept' }, 'type must be atom-map'],
  ['wrong schema version', { schemaVersion: 2 }, 'schemaVersion must be 1'],
  ['missing source', { source: ' ' }, 'source is required'],
  ['atoms not a list', { atoms: 'x' }, 'complete atom records'],
  ['unknown atom field', { atoms: [{ ...atom, extra: 1 }] }, 'complete atom records'],
  ['missing atom field', { atoms: [{ ...atom, tags: undefined }] }, 'complete atom records'],
  ['blank atom id', { atoms: [{ ...atom, id: ' ' }] }, 'complete atom records'],
  ['bad text hash', { atoms: [{ ...atom, textSha256: 'zz' }] }, 'complete atom records'],
  ['empty placements', { atoms: [{ ...atom, placements: [] }] }, 'complete atom records'],
  [
    'empty heading path',
    { atoms: [{ ...atom, placements: [{ headingPath: [] }] }] },
    'complete atom records',
  ],
  [
    'extra placement field',
    { atoms: [{ ...atom, placements: [{ extra: 1, headingPath: ['A'] }] }] },
    'complete atom records',
  ],
  ['placement not an object', { atoms: [{ ...atom, placements: ['x'] }] }, 'complete atom records'],
  ['placements not a list', { atoms: [{ ...atom, placements: 'x' }] }, 'complete atom records'],
  ['negative precedence', { atoms: [{ ...atom, precedence: -1 }] }, 'complete atom records'],
  ['fractional counter', { atoms: [{ ...atom, helpful: 0.5 }] }, 'complete atom records'],
  ['string behavioral flag', { atoms: [{ ...atom, behavioral: 'yes' }] }, 'complete atom records'],
  ['unknown status', { atoms: [{ ...atom, status: 'draft' }] }, 'complete atom records'],
  ['non-string probe id', { atoms: [{ ...atom, probeIds: [1] }] }, 'complete atom records'],
  ['atom not an object', { atoms: [null] }, 'complete atom records'],
  ['duplicate atom id', { atoms: [atom, atom] }, 'duplicate atom id'],
  ['sensitivity not a list', { sensitivity: 'x' }, 'complete sensitivity records'],
  [
    'sensitivity flips above tries',
    { sensitivity: [{ mutantsFlipped: 2, mutantsTried: 1, probeId: 'p' }] },
    'complete sensitivity records',
  ],
  [
    'sensitivity extra field',
    { sensitivity: [{ extra: 1, mutantsFlipped: 0, mutantsTried: 1, probeId: 'p' }] },
    'complete sensitivity records',
  ],
  ['sensitivity not an object', { sensitivity: [3] }, 'complete sensitivity records'],
  [
    'duplicate sensitivity probe',
    {
      sensitivity: [
        { mutantsFlipped: 0, mutantsTried: 1, probeId: 'p' },
        { mutantsFlipped: 0, mutantsTried: 1, probeId: 'p' },
      ],
    },
    'duplicate sensitivity probe id',
  ],
])('parseAtomMap rejects %s', (_name, overrides, message) => {
  expect(() => parseAtomMap(mapOf(overrides))).toThrow(message);
});

test('parseAtomMap rejects a document without OKF frontmatter', () => {
  expect(() => parseAtomMap('no frontmatter')).toThrow('OKF concept frontmatter is required.');
});

const hashOf = (text: string): string => realCrypto.createHash('sha256').update(text).digest('hex');

const fixture = [
  '---',
  'name: demo',
  'rules:',
  '  - one',
  '- top level item',
  '---',
  'Intro line one.',
  'Intro line two.',
  '',
  '# Title',
  '',
  'The first sentence is long enough to count. Second sentence.',
  '',
  '## Part',
  '',
  '- item one',
  '  continues here',
  '| a | b |',
  '```text',
  'code line',
  '',
  'still code',
  '```',
  'after fence',
  '### Deep',
  'deep text',
  '## Part two',
  'part two text',
  '---',
].join('\n');

const blockTexts = (source: string) => sourceBlocks(source).map((b) => [b.headingPath, b.text]);

test('sourceBlocks splits frontmatter, preamble, headings, lists, tables, fences, and paragraphs', () => {
  expect(blockTexts(fixture)).toEqual([
    [['frontmatter'], 'name: demo'],
    [['frontmatter'], 'rules:\n  - one\n- top level item'],
    [['(preamble)'], 'Intro line one.\nIntro line two.'],
    [['Title'], '# Title'],
    [['Title'], 'The first sentence is long enough to count. Second sentence.'],
    [['Title', 'Part'], '## Part'],
    [['Title', 'Part'], '- item one\n  continues here'],
    [['Title', 'Part'], '| a | b |'],
    [['Title', 'Part'], '```text\ncode line\n\nstill code\n```'],
    [['Title', 'Part'], 'after fence'],
    [['Title', 'Part', 'Deep'], '### Deep'],
    [['Title', 'Part', 'Deep'], 'deep text'],
    [['Title', 'Part two'], '## Part two'],
    [['Title', 'Part two'], 'part two text\n---'],
  ]);
});

test('sourceUnits splits prose into sentences and keeps atomic blocks whole', () => {
  const units = sourceUnits(fixture).map((u) => [u.headingPath, u.text]);
  expect(units).toContainEqual([['Title'], 'The first sentence is long enough to count.']);
  expect(units).toContainEqual([['Title'], 'Second sentence.']);
  expect(units).toContainEqual([['Title', 'Part'], '| a | b |']);
  expect(units).toContainEqual([['frontmatter'], 'rules:\n  - one\n- top level item']);
  expect(units).toContainEqual([['Title', 'Part'], '```text\ncode line\n\nstill code\n```']);
  expect(units).toContainEqual([['Title'], '# Title']);
});

test('sourceBlocks starts a frontmatter block when the first line is indented', () => {
  expect(blockTexts('---\n  indented\nkey: v\n---\n')).toEqual([
    [['frontmatter'], '  indented'],
    [['frontmatter'], 'key: v'],
  ]);
  expect(blockTexts('')).toEqual([]);
});

test('normalizeText and sha256Hex collapse whitespace and hash with SHA-256', () => {
  expect(normalizeText('  a \n\t b  ')).toBe('a b');
  expect(sha256Hex('abc')).toBe(hashOf('abc'));
});

test.each([
  ['identical text', 'one two three four', 'one two three four', 1],
  ['disjoint text', 'one two three four', 'five six seven eight', 0],
  ['text shorter than a shingle', 'one two', 'one two three', 0],
  ['one shared shingle of three', 'a b c d', 'a b c e', 1 / 3],
])('shingleSimilarity of %s', (_name, left, right, expected) => {
  expect(shingleSimilarity(left, right)).toBeCloseTo(expected, 6);
});

const policy = { duplicateReportOnly: true, duplicateSimilarity: 0.5, maxDocumentChars: 100000 };
const atomOf = (id: string, paths: string[][], text: string, probeIds: string[], extra = {}) => ({
  behavioral: false,
  harmful: 0,
  helpful: 0,
  id,
  placements: paths.map((headingPath) => ({ headingPath })),
  precedence: 0,
  probeIds,
  status: 'active' as const,
  tags: [],
  textSha256: hashOf(normalizeText(text)),
  ...extra,
});
const paragraph = 'The first sentence is long enough to count.';
const item = '- item one\n  continues here';
const cleanMap = () => ({
  atoms: [
    atomOf('a1', [['Title']], paragraph, ['p1']),
    atomOf('a2', [['Title', 'Part']], item, ['p2']),
  ],
  sensitivity: [],
  source: 'doc.md',
});

const kinds = (findings: readonly { kind: string }[]) => findings.map((f) => f.kind);

const run = (overrides = {}) =>
  checkAtoms({
    activeProbeIds: ['p1', 'p2'],
    map: cleanMap(),
    policy,
    recordedRetirements: new Set<string>(),
    source: fixture,
    ...overrides,
  });

test('checkAtoms reports nothing for a consistent map', () => {
  expect(run()).toEqual([]);
});

test('checkAtoms reports orphan atoms and orphan probes', () => {
  const map = {
    ...cleanMap(),
    atoms: [
      atomOf('a1', [['Title']], paragraph, ['gone']),
      atomOf('a2', [['Title', 'Part']], item, []),
    ],
  };
  const findings = run({ activeProbeIds: ['extra'], map });
  expect(findings.map((f) => [f.kind, f.atomId ?? f.probeId, f.severity, f.source])).toEqual([
    ['orphan-atom', 'a1', 'error', 'doc.md'],
    ['orphan-atom', 'a2', 'error', 'doc.md'],
    ['orphan-probe', 'extra', 'error', 'doc.md'],
  ]);
});

test.each([
  ['changed text', atomOf('a1', [['Title']], 'A different sentence.', ['p1'])],
  ['moved heading', atomOf('a1', [['Other']], paragraph, ['p1'])],
  ['extra recorded placement', atomOf('a1', [['Title'], ['Title', 'Part two']], paragraph, ['p1'])],
])('checkAtoms reports placement drift for %s', (_name, atom) => {
  const map = { ...cleanMap(), atoms: [atom, cleanMap().atoms[1]] };
  const findings = run({ map });
  expect(findings.map((f) => [f.kind, f.atomId])).toEqual([['anchor-drift', 'a1']]);
});

const repeated = `${fixture}\n\n${paragraph}`;

test('checkAtoms understands a rule placed twice as one atom with two placements', () => {
  const both = atomOf('a1', [['Title'], ['Title', 'Part two']], paragraph, ['p1']);
  const map = { ...cleanMap(), atoms: [both, cleanMap().atoms[1]] };
  const findings = run({ map, source: repeated });
  expect(findings.map((f) => [f.kind, f.severity])).toEqual([['duplicate-text', 'report']]);
  expect(findings[0]?.detail).toContain(
    'Identical text at 2 placements (Title | Title > Part two)',
  );
});

test('checkAtoms flags an unrecorded second placement as drift', () => {
  const findings = run({ source: repeated });
  expect(findings.map((f) => [f.kind, f.atomId])).toEqual([
    ['anchor-drift', 'a1'],
    ['duplicate-text', undefined],
  ]);
});

test('checkAtoms requires a retirement record only for retired atoms', () => {
  const retired = atomOf('gone', [['Title']], 'Removed rule text.', [], { status: 'retired' });
  const map = { ...cleanMap(), atoms: [...cleanMap().atoms, retired] };
  expect(kinds(run({ map }))).toEqual(['unrecorded-retirement']);
  expect(run({ map, recordedRetirements: new Set(['gone']) })).toEqual([]);
});

test('checkAtoms enforces the document size budget', () => {
  const size = normalizeText(fixture).length;
  const findings = run({ policy: { ...policy, maxDocumentChars: size - 1 } });
  expect(findings.map((f) => [f.kind, f.detail])).toEqual([
    ['size-budget', `Source is ${size} characters, over the ${size - 1} budget.`],
  ]);
  expect(run({ policy: { ...policy, maxDocumentChars: size } })).toEqual([]);
});

test('checkAtoms flags near-duplicate atoms with the configured severity', () => {
  const twin = 'The first sentence is long enough to count today.';
  const source = `${fixture}\n\n${twin}`;
  const map = {
    ...cleanMap(),
    atoms: [...cleanMap().atoms, atomOf('a3', [['Title', 'Part two']], twin, ['p3'])],
  };
  const base = { activeProbeIds: ['p1', 'p2', 'p3'], map, source };
  const report = checkAtoms({ ...base, policy, recordedRetirements: new Set() });
  expect(report.map((f) => [f.kind, f.atomId, f.severity])).toEqual([
    ['near-duplicate', 'a1', 'report'],
  ]);
  expect(report[0]?.detail).toContain('Similar to a3');
  const strict = checkAtoms({
    ...base,
    policy: { ...policy, duplicateReportOnly: false },
    recordedRetirements: new Set(),
  });
  expect(strict[0]?.severity).toBe('error');
  const loose = checkAtoms({
    ...base,
    policy: { ...policy, duplicateSimilarity: 0.99 },
    recordedRetirements: new Set(),
  });
  expect(loose).toEqual([]);
});

test('policy parser validates fields', () => {
  expect(parseAtomCheckPolicy(policy)).toEqual(policy);
  expect(() => parseAtomCheckPolicy(null)).toThrow('must be an object');
  for (const bad of [
    { ...policy, duplicateReportOnly: 'yes' },
    { ...policy, duplicateSimilarity: 0 },
    { ...policy, duplicateSimilarity: 1.5 },
    { ...policy, duplicateSimilarity: '0.5' },
    { ...policy, maxDocumentChars: 0 },
    { ...policy, maxDocumentChars: 1.5 },
    { ...policy, maxDocumentChars: undefined },
  ]) {
    expect(() => parseAtomCheckPolicy(bad)).toThrow('missing or out of range');
  }
});
