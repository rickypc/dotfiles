import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import realMatter from 'gray-matter';
import * as realFilesystem from '../../../utils/filesystem.js';
import * as realOkf from '../../../utils/okf.js';
import * as realAtoms from '../../../utils/quality-engine/atoms.js';

// Real implementations are registered for every imported module so no divergent double can leak
// into other test files that share this process.
mock.module('node:crypto', () => realCrypto);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../filesystem.js', () => realFilesystem);
mock.module('../okf.js', () => realOkf);
mock.module('./atoms.js', () => realAtoms);

const { auditAtoms } = await import('../../../utils/quality-engine/atom-audit.js');

const root = '/agents';
const sentence = 'The agent must answer in English always.';
const source = `# Rules\n\n${sentence}\n`;
const hash = realCrypto.createHash('sha256').update(sentence).digest('hex');
const atom = {
  behavioral: false,
  harmful: 0,
  helpful: 0,
  id: 'a1',
  placements: [{ headingPath: ['Rules'] }],
  precedence: 0,
  probeIds: ['p1'],
  status: 'active',
  tags: [],
  textSha256: hash,
};
const mapText = (overrides: Record<string, unknown> = {}): string => {
  const fields = {
    atoms: [atom],
    description: 'd',
    schemaVersion: 1,
    source: 'skills/demo/SKILL.md',
    tags: ['atoms'],
    title: 't',
    type: 'atom-map',
    ...overrides,
  };
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join('\n')}\n---\nbody\n`;
};
const setText = (queries: unknown[]): string => JSON.stringify({ queries });
const policy = { duplicateReportOnly: true, duplicateSimilarity: 0.5, maxDocumentChars: 100000 };
const demoOwner = {
  artifacts: {
    atoms: ['evals/skills/demo/atoms/SKILL.md'],
    comprehension: [{ setPath: 'evals/skills/demo/comprehension/SKILL.json' }, 7],
  },
  directory: 'evals/skills/demo/',
  id: 'skill:demo',
  requiredLanes: ['contract', 'atoms'],
};
const rootOwner = {
  artifacts: {
    atoms: ['evals/atoms/AGENTS.md'],
    comprehension: ['evals/comprehension/AGENTS.json'],
  },
  id: 'root',
  requiredLanes: ['atoms'],
};
const manifestText = (owners: unknown[], atomChecks: unknown = policy): string =>
  JSON.stringify({ owners, policy: { atomChecks } });
const filesFor = (extra: Record<string, string> = {}): Record<string, string> => ({
  [`${root}/evals/manifest.json`]: manifestText([
    demoOwner,
    rootOwner,
    { ...demoOwner, id: 'skill:plain', requiredLanes: ['contract'] },
    { id: 'skill:bare', requiredLanes: ['atoms'] },
    null,
  ]),
  [`${root}/evals/skills/demo/atoms/SKILL.md`]: mapText(),
  [`${root}/evals/skills/demo/comprehension/SKILL.json`]: setText([
    { id: 'p1' },
    { id: 'p2', retired: 'obsolete' },
  ]),
  [`${root}/skills/demo/SKILL.md`]: source,
  [`${root}/evals/atoms/AGENTS.md`]: mapText({ source: 'AGENTS.md' }),
  [`${root}/evals/comprehension/AGENTS.json`]: setText([{ id: 'p1' }]),
  [`${root}/AGENTS.md`]: source,
  ...extra,
});
const readerFor = (files: Record<string, string>) => ({
  readFile: async (path: string): Promise<string> => {
    const text = files[path];
    if (text === undefined) {
      throw new Error(`ENOENT ${path}`);
    }
    return text;
  },
});
const audit = (files: Record<string, string>, ownerId?: string) =>
  auditAtoms(readerFor(files), root, ownerId);

test('audits every owner with the atoms lane and skips the others', async () => {
  const owners = await audit(filesFor());
  const summary = owners.map(({ ownerId, maps, atoms, probesMapped, errors, findings }) => ({
    atoms,
    errors,
    findings,
    maps,
    ownerId,
    probesMapped,
  }));
  expect(summary).toEqual([
    { atoms: 1, errors: [], findings: [], maps: 1, ownerId: 'skill:demo', probesMapped: 1 },
    { atoms: 1, errors: [], findings: [], maps: 1, ownerId: 'root', probesMapped: 1 },
  ]);
  expect(owners[0]?.sensitivity).toEqual({ calibrated: 0, uncalibrated: 0, unmeasured: 1 });
});

test('findings always carry their owner id', async () => {
  const files = filesFor({
    [`${root}/evals/skills/demo/comprehension/SKILL.json`]: setText([{ id: 'p1' }, { id: 'p3' }]),
  });
  const [owner] = await audit(files, 'skill:demo');
  expect(owner?.findings.map((f) => [f.ownerId, f.kind, f.probeId])).toEqual([
    ['skill:demo', 'orphan-probe', 'p3'],
  ]);
  expect(owner?.probesMapped).toBe(1);
});

test('classifies probe sensitivity from the atom map', async () => {
  const sensitivity = [
    { mutantsFlipped: 0, mutantsTried: 3, probeId: 'p1' },
    { mutantsFlipped: 1, mutantsTried: 2, probeId: 'p3' },
    { mutantsFlipped: 0, mutantsTried: 0, probeId: 'p4' },
  ];
  const files = filesFor({
    [`${root}/evals/skills/demo/atoms/SKILL.md`]: mapText({ sensitivity }),
    [`${root}/evals/skills/demo/comprehension/SKILL.json`]: setText(
      ['p1', 'p3', 'p4', 'p5'].map((id) => ({ id })),
    ),
  });
  const [owner] = await audit(files, 'skill:demo');
  expect(owner?.sensitivity).toEqual({ calibrated: 1, uncalibrated: 1, unmeasured: 2 });
  expect(owner?.uncalibrated).toEqual([
    { mutantsTried: 3, probeId: 'p1', source: 'skills/demo/SKILL.md' },
  ]);
});

test('reads atom retirement records from the owner retirements file', async () => {
  const retired = { ...atom, id: 'gone', probeIds: [], status: 'retired', textSha256: hash };
  const files = filesFor({
    [`${root}/evals/skills/demo/atoms/SKILL.md`]: mapText({ atoms: [atom, retired] }),
    [`${root}/evals/skills/demo/retirements.json`]: JSON.stringify({
      retirements: [{ caseId: 'atom:gone' }, { caseId: 'plain-case' }, null],
    }),
  });
  expect((await audit(files, 'skill:demo'))[0]?.findings).toEqual([]);
  const unrecorded = filesFor({
    [`${root}/evals/skills/demo/atoms/SKILL.md`]: mapText({ atoms: [atom, retired] }),
    [`${root}/evals/skills/demo/retirements.json`]: JSON.stringify({ retirements: 'none' }),
  });
  expect((await audit(unrecorded, 'skill:demo'))[0]?.findings.map((f) => f.kind)).toEqual([
    'unrecorded-retirement',
  ]);
  const missingFile = await audit(
    filesFor({
      [`${root}/evals/skills/demo/atoms/SKILL.md`]: mapText({ atoms: [atom, retired] }),
    }),
    'skill:demo',
  );
  expect(missingFile[0]?.findings.map((f) => f.kind)).toEqual(['unrecorded-retirement']);
});

test('reports a map that cannot be audited as an owner error', async () => {
  const noSet = filesFor({
    [`${root}/evals/skills/demo/comprehension/SKILL.json`]: setText([]),
  });
  const owner = { ...demoOwner, artifacts: { ...demoOwner.artifacts, comprehension: 'none' } };
  const files = {
    ...noSet,
    [`${root}/evals/manifest.json`]: manifestText([owner]),
  };
  const [result] = await audit(files);
  expect(result?.errors).toEqual([
    'evals/skills/demo/atoms/SKILL.md: No comprehension set matches evals/skills/demo/atoms/SKILL.md.',
  ]);
  const broken = filesFor({ [`${root}/evals/skills/demo/atoms/SKILL.md`]: 'no frontmatter' });
  const [failed] = await audit(broken, 'skill:demo');
  expect(failed?.errors[0]).toContain('OKF concept frontmatter is required.');
  const missing = filesFor();
  delete missing[`${root}/evals/skills/demo/atoms/SKILL.md`];
  const [absent] = await audit(missing, 'skill:demo');
  expect(absent?.errors[0]).toContain('ENOENT');
  const unreadable = filesFor({
    [`${root}/evals/skills/demo/atoms/SKILL.md`]: mapText({ source: 3 }),
  });
  const [odd] = await audit(unreadable, 'skill:demo');
  expect(odd?.errors[0]).toContain('source is required');
});

test('tolerates a malformed comprehension set and a non-string failure', async () => {
  const files = filesFor({
    [`${root}/evals/skills/demo/comprehension/SKILL.json`]: JSON.stringify(['not a set']),
  });
  const [owner] = await audit(files, 'skill:demo');
  expect(owner?.probesMapped).toBe(0);
  expect(owner?.findings.map((f) => f.kind)).toEqual(['orphan-atom']);
  const thrower = {
    readFile: async (path: string): Promise<string> => {
      if (path.endsWith('SKILL.md') && path.includes('atoms')) {
        throw 'plain failure';
      }
      return filesFor()[path] ?? '';
    },
  };
  const [failed] = await auditAtoms(thrower, root, 'skill:demo');
  expect(failed?.errors).toEqual(['evals/skills/demo/atoms/SKILL.md: plain failure']);
});

test('rejects an unknown owner, a malformed manifest, and an invalid policy', async () => {
  await expect(audit(filesFor(), 'skill:none')).rejects.toThrow('No owner with the atoms lane');
  for (const text of [
    JSON.stringify(['x']),
    JSON.stringify({ owners: [] }),
    JSON.stringify({ policy: {} }),
  ]) {
    await expect(audit(filesFor({ [`${root}/evals/manifest.json`]: text }))).rejects.toThrow(
      'no policy or owners',
    );
  }
  await expect(
    audit(filesFor({ [`${root}/evals/manifest.json`]: manifestText([], { maxDocumentChars: 1 }) })),
  ).rejects.toThrow('Atom check policy fields');
});

test('reports a comprehension set that has no atom map', async () => {
  const owner = {
    ...demoOwner,
    artifacts: { ...demoOwner.artifacts, atoms: [] },
  };
  const files = filesFor({ [`${root}/evals/manifest.json`]: manifestText([owner]) });
  const [result] = await audit(files);
  expect(result?.errors).toEqual([
    'No atom map for comprehension set evals/skills/demo/comprehension/SKILL.json.',
  ]);
});
