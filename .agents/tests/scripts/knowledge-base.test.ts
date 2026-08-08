import { expect, mock, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run, runWhenMain, usage } from '../../scripts/knowledge-base.js';
import type {
  importPlan,
  searchKnowledgeBase,
  searchKnowledgeBaseBatch,
} from '../../utils/knowledge-base.js';

const concept = [
  '---',
  'type: "note"',
  'title: "Title"',
  'description: "Description"',
  'tags: ["one"]',
  '---',
  '',
  'Body',
].join('\n');

test('renders KB index paths, validates an OKF file, and renders parent indexes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-base-test-'));
  const conceptPath = join(directory, 'concept.md');
  const write = mock();
  try {
    await writeFile(conceptPath, concept);
    await run(['concept-index', 'shared/team/decision.md'], write);
    await run(['validate', conceptPath], write);
    await run(['render-index', 'Team', 'decision.md'], write);
    expect(write.mock.calls).toEqual([
      ['shared/team/index.md'],
      ['okf: passed'],
      [expect.stringContaining('[decision](decision.md)')],
    ]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('captures through an injected KB writer', async () => {
  const write = mock();
  const capture = mock(async () => ({
    conceptPath: '/kb/shared/team/a.md',
    rootIndexPath: '/kb/index.md',
    scopeIndexPath: '/kb/shared/index.md',
    subjectIndexPath: '/kb/shared/team/index.md',
  }));
  await run(
    [
      'capture',
      '/kb',
      'shared/team/a.md',
      '{"type":"note","title":"T","description":"D","tags":["t"]}',
      'Body',
      'Evidence',
    ],
    write,
    capture,
  );
  expect(capture).toHaveBeenCalled();
  expect(write).toHaveBeenCalledWith(expect.stringContaining('conceptPath'));
});

test('passes only the supplied plan path to the KB-owned importer', async () => {
  const write = mock();
  const importer = mock(async (_fileSystem, _kbRoot, planPath: string) => ({
    conceptPath: 'workspace-example-app/plans/plan.md',
    planPath,
  })) as unknown as typeof importPlan;
  await run(
    ['import-plan', '.agents/plans/workspace-example-app/plan.md'],
    write,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    importer,
  );
  expect(importer).toHaveBeenCalledWith(
    expect.anything(),
    expect.stringContaining('agent-knowledge-base'),
    expect.stringMatching(/\.agents\//u),
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('conceptPath'));
});

test('uses validated file search for a two-argument KB search', async () => {
  const write = mock();
  const search = mock(
    async () => [] as Awaited<ReturnType<typeof searchKnowledgeBase>>,
  );
  await run(['search', '/kb', 'query'], write, undefined, search);
  expect(search).toHaveBeenCalledWith(expect.anything(), '/kb', 'query');
});

test('searches a KB through an injected search boundary without touching CBM', async () => {
  const write = mock();
  const search = mock(async () => [
    {
      description: 'd',
      path: 'shared/practice/fixture.md',
      title: 'Fixture',
      type: 'practice',
    },
  ]);
  await run(['search', '/kb', 'fixture'], write, undefined, search);
  expect(search).toHaveBeenCalledWith(expect.anything(), '/kb', 'fixture');
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('shared/practice/fixture.md'),
  );
});

test('returns related concepts through the validated search boundary', async () => {
  const write = mock();
  const search = mock(async () => []);
  await run(['related', '/kb', 'testing'], write, undefined, search);
  expect(search).toHaveBeenCalledWith(expect.anything(), '/kb', 'testing');
  expect(write).toHaveBeenCalledWith('[]');
});

test('uses CBM and shared fallback for a three-argument KB discovery search', async () => {
  const write = mock();
  const discover = mock(
    async () =>
      ({
        concepts: [],
        discovery: { attempts: [], found: false, output: '', source: 'none' },
      }) as const,
  );
  await run(
    ['search', '/kb', 'kb-index', 'fixture'],
    write,
    undefined,
    undefined,
    discover,
  );
  expect(discover).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    '/kb',
    'kb-index',
    'fixture',
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('discovery'));
});

test('runs bounded distinct searches through the shared batch boundary', async () => {
  const write = mock();
  const batchSearch = mock(
    async () =>
      [
        {
          query: 'verifier',
          receipt: {
            concepts: [],
            discovery: {
              attempts: [],
              found: false,
              output: '',
              source: 'none',
            },
          },
        },
      ] as Awaited<ReturnType<typeof searchKnowledgeBaseBatch>>,
  );
  await run(
    ['search-batch', '/kb', 'kb-index', 'verifier'],
    write,
    undefined,
    undefined,
    undefined,
    undefined,
    batchSearch,
  );
  expect(batchSearch).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    '/kb',
    'kb-index',
    ['verifier'],
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('verifier'));
});

test('reconciles through one fixed request and an injected writer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-base-request-'));
  const requestPath = join(directory, 'request.json');
  const write = mock();
  const reconcile = mock(async () => ({ concepts: [], links: [] }));
  try {
    await writeFile(
      requestPath,
      '{"canonicalPath":"shared/testing/a.md","links":[],"operations":[]}',
    );
    await run(
      ['reconcile', '/kb', requestPath],
      write,
      undefined,
      undefined,
      undefined,
      reconcile,
    );
    expect(reconcile).toHaveBeenCalledWith(expect.anything(), '/kb', {
      canonicalPath: 'shared/testing/a.md',
      links: [],
      operations: [],
    });
    expect(write).toHaveBeenCalledWith(expect.stringContaining('concepts'));
    await writeFile(requestPath, 'not-json');
    await expect(
      run(
        ['reconcile', '/kb', requestPath],
        write,
        undefined,
        undefined,
        undefined,
        reconcile,
      ),
    ).rejects.toThrow('valid JSON');
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('rejects invalid KB input and guards the main boundary', async () => {
  await expect(run(['concept-index', '../secret.md'])).rejects.toThrow(usage());
  await expect(run([])).rejects.toThrow(usage());
  await expect(run(['search', '/kb'])).rejects.toThrow(usage());
  await expect(run(['related', '/kb', 'testing', 'extra'])).rejects.toThrow(
    usage(),
  );
  await expect(
    run(['capture', '/kb', 'shared/team/a.md', '{', 'Body', 'Evidence']),
  ).rejects.toThrow('metadata');
  const runner = mock();
  runWhenMain(true, ['render-index', 'Team'], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
