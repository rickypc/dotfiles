import { expect, mock, test } from 'bun:test';
import * as realCrypto from 'node:crypto';
import * as realPath from 'node:path';
import realMatter from 'gray-matter';
import * as realBatch from '../../../scripts/instruction-gate/batch.js';
import type { CommandResult, CommandSpec } from '../../../utils/contracts.js';
import * as realOkf from '../../../utils/okf.js';
import * as realAudit from '../../../utils/quality-engine/atom/audit.js';
import * as realBuild from '../../../utils/quality-engine/atom/build.js';
import * as realAtoms from '../../../utils/quality-engine/atom/index.js';
import * as realMutate from '../../../utils/quality-engine/atom/mutate.js';
import * as realTrain from '../../../utils/quality-engine/train/index.js';

interface Item {
  readonly answersPath: string;
  readonly bundlePath: string;
}

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('node:crypto', () => realCrypto);
mock.module('node:path', () => realPath);
mock.module('gray-matter', () => ({ default: realMatter }));
mock.module('../utils/okf.js', () => realOkf);
mock.module('../utils/quality-engine/atom-audit.js', () => realAudit);
mock.module('../utils/quality-engine/atom-build.js', () => realBuild);
mock.module('../utils/quality-engine/atom-mutate.js', () => realMutate);
mock.module('../utils/quality-engine/atoms.js', () => realAtoms);
mock.module('../utils/quality-engine/train.js', () => realTrain);
mock.module('./instruction-gate-batch.js', () => realBatch);

const { calibrateOwners } = await import('../../../scripts/instruction-gate/calibrate.js');
const { buildAtomMap, renderAtomMap } = realBuild;
const { parseAtomMap } = realAtoms;

const hashOf = (text: string): string => realCrypto.createHash('sha256').update(text).digest('hex');
const source = '# Rules\n\nThe agent must always check MARK. Plain sentence two.\n';
const probe = (id: string, split: string, evidence: string) => ({
  evidence,
  expected: 'A',
  id,
  query: `${id}?\nA) one\nB) two`,
  split,
});
const setText = JSON.stringify({
  kind: 'comprehension',
  queries: [
    probe('p1', 'train', 'always check MARK'),
    probe('p2', 'train', 'Plain sentence two'),
    probe('p3', 'validation', 'Rules'),
  ],
  runs_per_query: 3,
  skill_name: 'demo--SKILL',
  splits: { train: 't', validation: 'v' },
  target: '../../../../skills/demo/SKILL.md',
});
const built = buildAtomMap({
  existing: {
    atoms: [],
    sensitivity: [{ mutantsFlipped: 1, mutantsTried: 4, probeId: 'p9' }],
    source: 'skills/demo/SKILL.md',
  },
  probes: [
    { evidence: 'always check MARK', id: 'p1' },
    { evidence: 'Plain sentence two', id: 'p2' },
  ],
  source,
  sourcePath: 'skills/demo/SKILL.md',
}).map;
const manifest = JSON.stringify({
  owners: [
    {
      artifacts: { atoms: [], comprehension: ['evals/skills/demo/comprehension/SKILL.json'] },
      directory: 'evals/skills/demo/',
      id: 'skill:demo',
      requiredLanes: ['atoms'],
    },
  ],
});

// The fake reader answers 'A' everywhere except probe p1 once the checked sentence is gone.
const failedReader = (exitCode: number): CommandResult => ({
  code: 1,
  stderr: 'boom',
  stdout: exitCode === 2 ? '{"data":{"reason":"no-adapter"}}' : '',
});

const world = (extra: Record<string, string> = {}, exitCode = 0) => {
  const files = new Map<string, string>([
    ['/r/evals/manifest.json', manifest],
    ['/r/evals/skills/demo/comprehension/SKILL.json', setText],
    [
      '/r/evals/skills/demo/atoms/SKILL.md',
      renderAtomMap({
        ...built,
        sensitivity: [{ mutantsFlipped: 1, mutantsTried: 4, probeId: 'p9' }],
      }),
    ],
    ['/r/skills/demo/SKILL.md', source],
    ...Object.entries(extra),
  ]);
  const calls: CommandSpec[] = [];
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    calls.push(spec);
    if (exitCode !== 0) {
      return failedReader(exitCode);
    }
    const batch = JSON.parse(files.get(spec.args[2] ?? '') ?? '{}') as { items: Item[] };
    for (const item of batch.items) {
      const bundle = JSON.parse(files.get(item.bundlePath) ?? '{}') as {
        document: string;
        prompts: { query_id: string; run: number }[];
      };
      const gone = !bundle.document.includes('always check MARK');
      const lines = bundle.prompts.map((p) =>
        JSON.stringify({
          answer: gone && p.query_id === 'p1' ? 'B' : 'A',
          query_id: p.query_id,
          run: p.run,
        }),
      );
      files.set(item.answersPath, lines.join('\n'));
    }
    return { code: 0, stderr: '', stdout: '' };
  });
  const written: string[] = [];
  const deps = {
    agentsRoot: '/r',
    executor,
    makeTempDir: async () => '/work',
    readText: async (file: string) => files.get(file),
    sha256: hashOf,
    toolsRoot: '/tools',
    writeText: async (file: string, content: string) => {
      written.push(file);
      files.set(file, content);
    },
  };
  return { calls, deps, executor, files, written };
};

test('mutates the selected atoms, records which probes flip, and lists the insensitive ones', async () => {
  const { calls, deps, files, written } = world();
  const report = await calibrateOwners(deps, ['skill:demo'], false);
  expect(calls.map((c) => [c.command, c.args[0], c.args[1]])).toEqual([
    ['bun', '/tools/scripts/weak-reader/index.ts', 'batch'],
  ]);
  const [owner] = report.owners;
  expect(owner?.ownerId).toBe('skill:demo');
  expect(owner?.written).toBe(false);
  expect(owner?.documents).toEqual([
    {
      atoms: 2,
      document: 'skills/demo/SKILL.md',
      mapPath: 'evals/skills/demo/atoms/SKILL.md',
      mutants: 3,
      probes: [
        { mutantsFlipped: 1, mutantsTried: 2, probeId: 'p1' },
        { mutantsFlipped: 0, mutantsTried: 1, probeId: 'p2' },
      ],
    },
  ]);
  expect(owner?.uncalibrated).toEqual([{ document: 'skills/demo/SKILL.md', probeId: 'p2' }]);
  expect(written.some((file) => file.includes('/atoms/'))).toBe(false);
  const items = (JSON.parse(files.get('/work/batch.json') ?? '{}') as { items: Item[] }).items;
  expect(items).toHaveLength(4);
  const bundle = JSON.parse(files.get(items[1]?.bundlePath ?? '') ?? '{}') as {
    prompts: { query_id: string }[];
  };
  expect([...new Set(bundle.prompts.map((p) => p.query_id))]).toEqual(['p1']);
});

test('stores the measured sensitivity in the atom map and keeps unrelated records', async () => {
  const { deps, files } = world();
  const report = await calibrateOwners(deps, ['skill:demo'], true);
  expect(report.owners[0]?.written).toBe(true);
  const map = parseAtomMap(files.get('/r/evals/skills/demo/atoms/SKILL.md') ?? '');
  expect(map.sensitivity).toEqual([
    { mutantsFlipped: 1, mutantsTried: 2, probeId: 'p1' },
    { mutantsFlipped: 0, mutantsTried: 1, probeId: 'p2' },
    { mutantsFlipped: 1, mutantsTried: 4, probeId: 'p9' },
  ]);
  expect(map.atoms.map((a) => a.id)).toEqual(built.atoms.map((a) => a.id));
});

test('calibrates every listed owner in order', async () => {
  const { deps } = world();
  const report = await calibrateOwners(deps, ['skill:demo', 'skill:demo'], false);
  expect(report.owners.map((o) => o.ownerId)).toEqual(['skill:demo', 'skill:demo']);
});

test('reports a failed reader with the sandbox hint only for a no-adapter envelope', async () => {
  await expect(calibrateOwners(world({}, 2).deps, ['skill:demo'], false)).rejects.toThrow(
    'weak reader exited 1 (no GPU adapter: run this command outside the sandbox): boom',
  );
  await expect(calibrateOwners(world({}, 1).deps, ['skill:demo'], false)).rejects.toThrow(
    'weak reader exited 1: boom',
  );
});

test('fails when the reader wrote no answers', async () => {
  const { deps, executor } = world();
  executor.mockImplementation(async () => ({ code: 0, stderr: '', stdout: '' }));
  await expect(calibrateOwners(deps, ['skill:demo'], false)).rejects.toThrow(
    'The reader wrote no answers: /work/0-0.answers.jsonl',
  );
});

test.each([
  ['an unknown owner', ['skill:none'], {}, 'No owner with the atoms lane matches skill:none.'],
  [
    'a set without a target',
    ['skill:demo'],
    { '/r/evals/skills/demo/comprehension/SKILL.json': JSON.stringify({ queries: [] }) },
    'The comprehension set names no target document: evals/skills/demo/comprehension/SKILL.json.',
  ],
  [
    'a missing atom map',
    ['skill:demo'],
    { '/r/evals/skills/demo/atoms/SKILL.md': '' },
    'OKF concept frontmatter is required.',
  ],
])('rejects %s before the reader runs', async (_name, owners, extra, message) => {
  const setup = world(extra);
  await expect(calibrateOwners(setup.deps, owners, false)).rejects.toThrow(message);
  expect(setup.executor).not.toHaveBeenCalled();
});

test('rejects a missing source file', async () => {
  const setup = world();
  setup.files.delete('/r/skills/demo/SKILL.md');
  await expect(calibrateOwners(setup.deps, ['skill:demo'], false)).rejects.toThrow(
    'Missing file: /r/skills/demo/SKILL.md',
  );
});
