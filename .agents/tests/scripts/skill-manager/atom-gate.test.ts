import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import * as realOs from 'node:os';
import * as realPath from 'node:path';
import realMatter from 'gray-matter';
import * as realGatePaths from '../../../scripts/instruction-gate/paths.js';
import * as realPolicy from '../../../scripts/instruction-gate/policy.js';
import * as realFilesystem from '../../../utils/filesystem.js';
import * as realOkf from '../../../utils/okf.js';
import * as realAudit from '../../../utils/quality-engine/atom/audit.js';
import * as realAtoms from '../../../utils/quality-engine/atom/index.js';

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('node:crypto', () => realCrypto);
mock.module('node:path', () => realPath);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('./instruction-gate-paths.js', () => realGatePaths);
mock.module('./instruction-gate-policy.js', () => realPolicy);
mock.module('../utils/filesystem.js', () => realFilesystem);
mock.module('../utils/okf.js', () => realOkf);
mock.module('../utils/quality-engine/atom-audit.js', () => realAudit);
mock.module('../utils/quality-engine/atoms.js', () => realAtoms);

const sut = await import('../../../scripts/skill-manager/atom-gate.js');

const ROOT = realPath.join(realOs.homedir(), '.agents');
const sentence = 'The agent must answer in English always.';
const source = `# Rules\n\n${sentence}\n`;
const hash = realCrypto.createHash('sha256').update(sentence).digest('hex');

const mapText = (mapSource: string): string => {
  const fields = {
    atoms: [
      {
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
      },
    ],
    description: 'd',
    schemaVersion: 1,
    source: mapSource,
    tags: ['atoms'],
    title: 't',
    type: 'atom-map',
  };
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join('\n')}\n---\nbody\n`;
};

const setText = JSON.stringify({ queries: [{ id: 'p1' }] });

const owner = (id: string, directory: string, sets: string[], atoms: string[]) => ({
  artifacts: { atoms, comprehension: sets },
  directory,
  id,
  requiredLanes: ['atoms'],
});

const world = (extra: Record<string, string | undefined> = {}) => {
  const files: Record<string, string | undefined> = {
    [`${ROOT}/evals/manifest.json`]: JSON.stringify({
      owners: [
        owner('root', 'evals/', ['evals/comprehension/AGENTS.json'], ['evals/atoms/AGENTS.md']),
        owner(
          'skill:demo',
          'evals/skills/demo/',
          [
            'evals/skills/demo/comprehension/SKILL.json',
            'evals/skills/demo/comprehension/evals-rubric.json',
          ],
          ['evals/skills/demo/atoms/SKILL.md', 'evals/skills/demo/atoms/evals-rubric.md'],
        ),
      ],
      policy: {
        atomChecks: {
          duplicateReportOnly: true,
          duplicateSimilarity: 0.5,
          maxDocumentChars: 100000,
        },
      },
    }),
    [`${ROOT}/evals/comprehension/AGENTS.json`]: setText,
    [`${ROOT}/evals/skills/demo/comprehension/SKILL.json`]: setText,
    [`${ROOT}/evals/skills/demo/comprehension/evals-rubric.json`]: setText,
    [`${ROOT}/evals/atoms/AGENTS.md`]: mapText('AGENTS.md'),
    [`${ROOT}/evals/skills/demo/atoms/SKILL.md`]: mapText('skills/demo/SKILL.md'),
    [`${ROOT}/evals/skills/demo/atoms/evals-rubric.md`]: mapText('evals/skills/demo/rubric.md'),
    [`${ROOT}/AGENTS.md`]: source,
    [`${ROOT}/skills/demo/SKILL.md`]: source,
    [`${ROOT}/evals/skills/demo/rubric.md`]: source,
    ...extra,
  };
  const entry = (name: string, directory: boolean) => ({ isDirectory: () => directory, name });
  const tree: Record<string, ReturnType<typeof entry>[]> = {
    [ROOT]: [entry('AGENTS.md', false), entry('skills', true)],
    [`${ROOT}/skills`]: [entry('demo', true)],
    [`${ROOT}/skills/demo`]: [entry('SKILL.md', false)],
  };
  const fileSystem = {
    readdir: async (directory: string) => tree[directory] ?? [],
    readFile: async (file: string): Promise<string> => {
      const text = files[file];
      if (text === undefined) {
        throw new Error(`ENOENT ${file}`);
      }
      return text;
    },
  };
  return { deps: sut.atomGateDeps(fileSystem as never, ROOT), fileSystem };
};

test('a complete tree of maps passes the atom gate', async () => {
  const { deps, fileSystem } = world();
  expect(await sut.atomGateProblems(deps, fileSystem)).toEqual([]);
});

test('a document without an atom map fails by name and path, and the audit failure shows', async () => {
  const { deps, fileSystem } = world({
    [`${ROOT}/evals/skills/demo/atoms/SKILL.md`]: undefined,
  });
  const problems = await sut.atomGateProblems(deps, fileSystem);
  expect(problems[0]).toBe(
    'skills/demo/SKILL.md: no atom map at evals/skills/demo/atoms/SKILL.md.',
  );
  expect(problems.length).toBeGreaterThan(1);
});

test('a non-error thrown by the audit is still reported', async () => {
  const { deps } = world();
  const broken = {
    readFile: async () => {
      throw 'plain failure';
    },
  };
  const problems = await sut.atomGateProblems(deps, broken as never);
  expect(problems).toEqual(['Atom audit failed: plain failure']);
});

test('a map that has drifted from its document fails with its owner', async () => {
  const { deps, fileSystem } = world({
    [`${ROOT}/skills/demo/SKILL.md`]: '# Rules\n\nOther text entirely.\n',
  });
  const problems = await sut.atomGateProblems(deps, fileSystem);
  expect(problems.some((problem) => problem.startsWith('skill:demo: skills/demo/SKILL.md'))).toBe(
    true,
  );
});

test('an unlisted document is reported even when the audit passes', async () => {
  const { deps, fileSystem } = world();
  const gap = {
    ...deps,
    listDirectory: async (directory: string) =>
      directory === ROOT
        ? [
            { isDirectory: false, name: 'AGENTS.md' },
            { isDirectory: false, name: 'GEMINI.md' },
            { isDirectory: true, name: 'skills' },
          ]
        : deps.listDirectory(directory),
  };
  expect(await sut.atomGateProblems(gap, fileSystem)).toEqual([
    'GEMINI.md: no atom map at evals/atoms/GEMINI.md.',
  ]);
});

test('a custom root has no central atom lane and reports nothing', async () => {
  const { deps, fileSystem } = world();
  expect(await sut.atomGateProblems({ ...deps, agentsRoot: '/elsewhere' }, fileSystem)).toEqual([]);
});

test('atomGateDeps reads missing files as undefined and tolerates a missing readdir', async () => {
  const bare = sut.atomGateDeps(
    {
      readFile: async () => {
        throw new Error('missing');
      },
    } as never,
    ROOT,
  );
  expect(await bare.readText('/x')).toBeUndefined();
  expect(await bare.listDirectory('/x')).toEqual([]);
  const present = sut.atomGateDeps(
    {
      readdir: async () => [{ isDirectory: () => true, name: 'a' }],
      readFile: async () => 'text',
    } as never,
    ROOT,
  );
  expect(await present.readText('/x')).toBe('text');
  expect(await present.listDirectory('/x')).toEqual([{ isDirectory: true, name: 'a' }]);
});
