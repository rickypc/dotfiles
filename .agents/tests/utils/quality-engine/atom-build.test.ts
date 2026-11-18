import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import realMatter from 'gray-matter';
import * as realFilesystem from '../../../utils/filesystem.js';
import * as realOkf from '../../../utils/okf.js';
import * as realAudit from '../../../utils/quality-engine/atom-audit.js';
import * as realAtoms from '../../../utils/quality-engine/atoms.js';

// Real implementations are registered for every imported module so no divergent double can leak
// into other test files that share this process.
mock.module('node:crypto', () => realCrypto);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../filesystem.js', () => realFilesystem);
mock.module('../okf.js', () => realOkf);
mock.module('./atom-audit.js', () => realAudit);
mock.module('./atoms.js', () => realAtoms);

const { buildAtomMap, rebuildAtomMaps, renderAtomMap } = await import(
  '../../../utils/quality-engine/atom-build.js'
);
const { parseAtomMap } = realAtoms;

const hashOf = (text: string): string => realCrypto.createHash('sha256').update(text).digest('hex');
const idOf = (text: string): string => `r-${hashOf(text).slice(0, 10)}`;
const first = 'The agent must always answer in English.';
const second = 'Never skip the final gate before closing.';
const source = `# Rules\n\n${first} ${second}\n\n## Again\n\n${first}\n`;

test('links evidence to sentence atoms with every placement of repeated text', () => {
  const { map, retired, unresolved } = buildAtomMap({
    probes: [
      { evidence: 'always answer in English', id: 'p1' },
      { evidence: 'final gate', id: 'p2' },
      { evidence: 'English. Never skip', id: 'p3' },
      { evidence: 'text that is absent', id: 'p4' },
    ],
    source,
    sourcePath: 'doc.md',
  });
  expect(unresolved).toEqual(['p4']);
  expect(retired).toEqual([]);
  expect(map.source).toBe('doc.md');
  expect(
    map.atoms.map((atom) => [atom.id, atom.probeIds, atom.placements.map((p) => p.headingPath)]),
  ).toEqual([
    [idOf(first), ['p1', 'p3'], [['Rules'], ['Rules', 'Again']]],
    [idOf(second), ['p2', 'p3'], [['Rules']]],
  ]);
  expect(map.atoms[0]?.textSha256).toBe(hashOf(first));
});

test('keeps recorded state by atom id and retires atoms that left the source', () => {
  const gone = {
    behavioral: true,
    harmful: 2,
    helpful: 3,
    id: 'r-gone',
    placements: [{ headingPath: ['Old'] }],
    precedence: 4,
    probeIds: ['p9'],
    status: 'active' as const,
    tags: ['boundary'],
    textSha256: hashOf('gone'),
  };
  const kept = { ...gone, id: idOf(first), probeIds: ['p1'], textSha256: hashOf(first) };
  const already = { ...gone, id: 'r-old', probeIds: [], status: 'retired' as const };
  const existing = {
    atoms: [kept, gone, already],
    sensitivity: [
      { mutantsFlipped: 1, mutantsTried: 2, probeId: 'p1' },
      { mutantsFlipped: 0, mutantsTried: 1, probeId: 'p9' },
    ],
    source: 'doc.md',
  };
  const { map, retired } = buildAtomMap({
    existing,
    probes: [{ evidence: 'always answer in English', id: 'p1' }],
    source,
    sourcePath: 'doc.md',
  });
  expect(retired).toEqual(['r-gone']);
  expect(map.atoms.map((a) => [a.id, a.status, a.probeIds])).toEqual([
    [idOf(first), 'active', ['p1']],
    ['r-gone', 'retired', []],
    ['r-old', 'retired', []],
  ]);
  expect(map.atoms[0]).toMatchObject({
    behavioral: true,
    harmful: 2,
    helpful: 3,
    precedence: 4,
    tags: ['boundary'],
  });
  expect(map.sensitivity).toEqual([{ mutantsFlipped: 1, mutantsTried: 2, probeId: 'p1' }]);
});

test('renders a map that parses back, with a table of active atoms only', () => {
  const built = buildAtomMap({
    probes: [{ evidence: 'final gate', id: 'p|2' }],
    source: '# A|B\n\nNever skip the final gate before closing.\n',
    sourcePath: 'doc.md',
  });
  const base = built.map.atoms[0];
  if (base === undefined) {
    throw new Error('expected one atom');
  }
  const withRetired = {
    ...built.map,
    atoms: [...built.map.atoms, { ...base, id: 'r-x', status: 'retired' as const }],
    sensitivity: [{ mutantsFlipped: 0, mutantsTried: 1, probeId: 'p|2' }],
  };
  const text = renderAtomMap(withRetired);
  expect(parseAtomMap(text)).toEqual(withRetired);
  expect(text).toContain('| Atom | Placements | Probes |');
  expect(text).toContain('A/B');
  expect(text).not.toContain('`r-x`');
  expect(renderAtomMap(built.map)).not.toContain('sensitivity');
});

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const ownerRow = (
  id: string,
  directory: string,
  comprehension: unknown[],
  sourcePaths: string[],
) => ({
  artifacts: { atoms: [], comprehension, other: 1 },
  directory,
  id,
  requiredLanes: ['atoms'],
  sourcePaths,
});

const set = (evidence: string, target = '../../AGENTS.md') =>
  json({
    queries: [
      { evidence, id: 'p1' },
      { evidence: 'x', id: 'p2', retired: 'old' },
      null,
      { id: 'p3' },
    ],
    target,
  });

const world = (extra: Record<string, string> = {}) => {
  const files = new Map<string, string>([
    [
      '/r/evals/manifest.json',
      json({
        owners: [
          ownerRow('root', 'evals/', ['evals/comprehension/AGENTS.json'], ['AGENTS.md']),
          ownerRow(
            'skill:demo',
            'evals/skills/demo/',
            ['evals/skills/demo/comprehension/SKILL.json'],
            [],
          ),
          null,
        ],
      }),
    ],
    ['/r/evals/skills/demo/manifest.json', json({ artifacts: { atoms: [], x: 1 } })],
    ['/r/evals/comprehension/AGENTS.json', set('always answer in English')],
    [
      '/r/evals/skills/demo/comprehension/SKILL.json',
      set('final gate', '../../../../skills/demo/SKILL.md'),
    ],
    ['/r/AGENTS.md', source],
    ['/r/skills/demo/SKILL.md', source],
    ...Object.entries(extra),
  ]);
  const made: string[] = [];
  const fileSystem = {
    exists: async (path: string) => files.has(path),
    mkdir: async (path: string) => {
      made.push(path);
      return undefined;
    },
    readFile: async (path: string) => {
      const text = files.get(path);
      if (text === undefined) {
        throw new Error(`ENOENT ${path}`);
      }
      return text;
    },
    writeFile: async (path: string, content: string) => {
      files.set(path, content);
    },
  };
  return { fileSystem, files, made };
};

test('rebuild reports created maps and manifest changes without writing by default', async () => {
  const { fileSystem, files } = world();
  const before = new Map(files);
  const report = await rebuildAtomMaps(fileSystem, '/r', { write: false });
  expect(report.written).toBe(false);
  expect(report.manifests).toEqual(['evals/manifest.json', 'evals/skills/demo/manifest.json']);
  expect(report.maps.map((m) => [m.path, m.status, m.unresolvedProbes, m.retiredAtoms])).toEqual([
    ['evals/atoms/AGENTS.md', 'created', [], []],
    ['evals/skills/demo/atoms/SKILL.md', 'created', [], []],
  ]);
  expect(files).toEqual(before);
});

test('rebuild writes maps and manifest lists once, then reports unchanged', async () => {
  const { fileSystem, files, made } = world();
  const report = await rebuildAtomMaps(fileSystem, '/r', { write: true });
  expect(report.written).toBe(true);
  expect(made).toEqual(['/r/evals/atoms', '/r/evals/skills/demo/atoms']);
  expect(parseAtomMap(files.get('/r/evals/atoms/AGENTS.md') ?? '').atoms).toHaveLength(1);
  const root = JSON.parse(files.get('/r/evals/manifest.json') ?? '{}') as {
    owners: ({ artifacts: { atoms: string[] }; id: string } | null)[];
  };
  expect(root.owners.map((o) => o?.artifacts.atoms ?? null)).toEqual([
    ['evals/atoms/AGENTS.md'],
    ['evals/skills/demo/atoms/SKILL.md'],
    null,
  ]);
  const again = await rebuildAtomMaps(fileSystem, '/r', { write: true });
  expect(again.manifests).toEqual([]);
  expect(again.maps.map((m) => m.status)).toEqual(['unchanged', 'unchanged']);
  const changedSource = await rebuildAtomMaps(fileSystem, '/r', { ownerId: 'root', write: true });
  expect(changedSource.maps).toHaveLength(1);
  files.set('/r/AGENTS.md', '# Rules\n\nOther text entirely.\n');
  const drifted = await rebuildAtomMaps(fileSystem, '/r', { ownerId: 'root', write: true });
  expect(drifted.maps[0]).toMatchObject({ status: 'changed', unresolvedProbes: ['p1'] });
});

test.each([
  [
    'an owner filter that matches nothing',
    'skill:none',
    {},
    'No owner with the atoms lane matches skill:none.',
  ],
  [
    'a manifest with no owners',
    undefined,
    { '/r/evals/manifest.json': '{}' },
    'matches the manifest',
  ],
  [
    'a set without a target document',
    'root',
    { '/r/evals/comprehension/AGENTS.json': json({ queries: [] }) },
    'The comprehension set names no target document: evals/comprehension/AGENTS.json.',
  ],
  [
    'a manifest that does not round-trip',
    'skill:demo',
    { '/r/evals/skills/demo/manifest.json': '{"artifacts":{"atoms":[]}}' },
    'does not round-trip byte-identically',
  ],
  [
    'a skill manifest without artifacts',
    'skill:demo',
    { '/r/evals/skills/demo/manifest.json': json({ other: 1 }) },
    'has no artifacts object',
  ],
])('rebuild rejects %s', async (_name, ownerId, extra, message) => {
  const { fileSystem } = world(extra);
  await expect(rebuildAtomMaps(fileSystem, '/r', { ownerId, write: true })).rejects.toThrow(
    message,
  );
});

test('rebuild refreshes the source hashes of a skill manifest together with the map list', async () => {
  const rubric = '# Rubric\n';
  const stale = json({
    artifacts: { atoms: [] },
    fingerprints: { sourceRubricSha256: 'stale' },
    sourceRubric: 'evals/skills/demo/rubric.md',
    sources: [
      { sha256: 'stale', sourcePath: 'skills/demo/SKILL.md' },
      { sha256: 'stale', sourcePath: 'evals/skills/demo/rubric.md' },
      null,
    ],
  });
  const { fileSystem, files } = world({
    '/r/evals/skills/demo/manifest.json': stale,
    '/r/evals/skills/demo/rubric.md': rubric,
  });
  const preview = await rebuildAtomMaps(fileSystem, '/r', { ownerId: 'skill:demo', write: false });
  expect(preview.manifests).toEqual(['evals/manifest.json', 'evals/skills/demo/manifest.json']);
  expect(files.get('/r/evals/skills/demo/manifest.json')).toBe(stale);
  await rebuildAtomMaps(fileSystem, '/r', { ownerId: 'skill:demo', write: true });
  const written = JSON.parse(files.get('/r/evals/skills/demo/manifest.json') ?? '{}') as {
    fingerprints: { sourceRubricSha256: string };
    sources: ({ sha256: string; sourcePath: string } | null)[];
  };
  expect(written.sources).toEqual([
    { sha256: hashOf(source), sourcePath: 'skills/demo/SKILL.md' },
    { sha256: hashOf(rubric), sourcePath: 'evals/skills/demo/rubric.md' },
    null,
  ]);
  expect(written.fingerprints.sourceRubricSha256).toBe(hashOf(rubric));
  const again = await rebuildAtomMaps(fileSystem, '/r', { ownerId: 'skill:demo', write: true });
  expect(again.manifests).toEqual([]);
});

test('rebuild derives the case and activation fingerprints from their files', async () => {
  const cases = '{"id":"c1"}\n';
  const { fileSystem, files } = world({
    '/r/evals/skills/demo/cases.jsonl': cases,
    '/r/evals/skills/demo/manifest.json': json({
      artifacts: { activationQueries: 5, atoms: [], cases: 'evals/skills/demo/cases.jsonl' },
      fingerprints: {
        activationQueriesSha256: 'kept',
        caseRetirementsSha256: 'manual',
        casesSha256: 'stale',
      },
      sources: [],
    }),
  });
  await rebuildAtomMaps(fileSystem, '/r', { ownerId: 'skill:demo', write: true });
  const written = JSON.parse(files.get('/r/evals/skills/demo/manifest.json') ?? '{}') as {
    fingerprints: Record<string, string>;
  };
  expect(written.fingerprints).toEqual({
    activationQueriesSha256: 'kept',
    caseRetirementsSha256: 'manual',
    casesSha256: hashOf(cases),
  });
});

test('rebuild tags behavioral atoms from the coverage map and lists unmapped cases', async () => {
  const coverage = json({
    root: { cases: [] },
    skills: [
      {
        behaviorCases: {
          cases: [
            { id: 'c-hit', sourceRule: 'skills/demo/SKILL.md:3-3 - always answer in English' },
            { id: 'c-miss', sourceRule: 'skills/other/SKILL.md:1-2 - elsewhere' },
          ],
        },
      },
    ],
  });
  const { fileSystem, files } = world({ '/r/evals/coverage-map.json': coverage });
  const report = await rebuildAtomMaps(fileSystem, '/r', { write: true });
  expect(report.unmappedCases).toEqual(['c-miss']);
  expect(report.maps.map((m) => [m.path, m.behavioral, m.mappedCases])).toEqual([
    ['evals/atoms/AGENTS.md', 0, []],
    ['evals/skills/demo/atoms/SKILL.md', 1, ['c-hit']],
  ]);
  const map = parseAtomMap(files.get('/r/evals/skills/demo/atoms/SKILL.md') ?? '');
  expect(map.atoms.map((atom) => atom.behavioral)).toEqual([true]);
});

test('an atom that was retired and returns to the source is one active atom, not a duplicate', () => {
  const returning = {
    behavioral: false,
    harmful: 0,
    helpful: 2,
    id: idOf(first),
    placements: [{ headingPath: ['Old'] }],
    precedence: 0,
    probeIds: [],
    status: 'retired' as const,
    tags: [],
    textSha256: hashOf(first),
  };
  const { map } = buildAtomMap({
    existing: { atoms: [returning], sensitivity: [], source: 'doc.md' },
    probes: [{ evidence: 'always answer in English', id: 'p1' }],
    source,
    sourcePath: 'doc.md',
  });
  expect(map.atoms.filter((atom) => atom.id === idOf(first))).toHaveLength(1);
  expect(map.atoms.find((atom) => atom.id === idOf(first))?.status).toBe('active');
});
