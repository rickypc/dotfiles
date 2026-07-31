import { expect, test } from 'bun:test';

import {
  assertAllowedCbmRoot,
  cbmCommands,
  cbmOutputHasMatches,
  indexIsReady,
  readWithReadyIndex,
  searchWithCbmFallback,
} from '../../utils/codebase-memory.js';

test('builds CLI-only CBM command specifications', () => {
  expect(cbmCommands.listProjects()).toEqual({
    args: ['cli', 'list_projects'],
    command: 'codebase-memory-mcp',
    environment: { CBM_LOG_LEVEL: 'error' },
  });
  expect(cbmCommands.indexRepository('/repo', 'repo')).toEqual({
    args: [
      'cli',
      'index_repository',
      '--repo-path',
      '/repo',
      '--name',
      'repo',
      '--mode',
      'full',
    ],
    command: 'codebase-memory-mcp',
    environment: { CBM_LOG_LEVEL: 'error' },
  });
  expect(cbmCommands.searchGraph('repo', 'service', 5).args).toContain(
    '--query',
  );
  expect(cbmCommands.searchGraph('repo', 'service', 5).environment).toEqual({
    CBM_LOG_LEVEL: 'error',
  });
  expect(cbmCommands.getArchitecture('repo').args).toContain('overview');
  expect(cbmCommands.getCodeSnippet('repo', 'a.b').args).toContain(
    '--qualified-name',
  );
  expect(cbmCommands.getGraphSchema('repo').args).toContain('get_graph_schema');
  expect(cbmCommands.queryGraph('repo', 'MATCH', 3).args).toContain(
    '--max-rows',
  );
  expect(cbmCommands.searchCode('repo', 'literal', 3).args).toContain(
    'compact',
  );
  expect(
    cbmCommands.searchGraphByName('repo', '.*A.*', 'Function', 3).args,
  ).toContain('--name-pattern');
  expect(cbmCommands.tracePath('repo', 'a.b', 'inbound', 2).args).toContain(
    'calls',
  );
});

test('indexes one allowed root then retries the requested CBM read once', async () => {
  const results = [
    { code: 0, stderr: '', stdout: 'not ready' },
    { code: 0, stderr: '', stdout: 'index complete' },
    { code: 0, stderr: '', stdout: 'ready' },
    { code: 0, stderr: '', stdout: 'result' },
  ];
  const result = await readWithReadyIndex(
    async () =>
      results.shift() ?? { code: 1, stderr: 'unexpected', stdout: '' },
    {
      allowedRoots: ['/repo', '/home', '/kb'],
      read: (project) => cbmCommands.searchGraph(project, 'symbol', 5),
      root: { index: 'repo', root: '/repo/' },
    },
  );
  expect(result).toEqual({ indexed: true, output: 'result', project: 'repo' });
  assertAllowedCbmRoot('/home', ['/repo', '/home']);
  expect(() => assertAllowedCbmRoot('/other', ['/repo'])).toThrow(
    'not allowed',
  );
});

test('reports failed indexing, readiness, and read results', async () => {
  const failure = async () => ({ code: 1, stderr: 'bad', stdout: '' });
  await expect(
    readWithReadyIndex(failure, {
      allowedRoots: ['/repo'],
      read: () => cbmCommands.listProjects(),
      root: { index: 'repo', root: '/repo' },
    }),
  ).rejects.toThrow('indexing');
  const notReady = async () => ({ code: 0, stderr: '', stdout: 'not ready' });
  await expect(
    readWithReadyIndex(notReady, {
      allowedRoots: ['/repo'],
      read: () => cbmCommands.listProjects(),
      root: { index: 'repo', root: '/repo' },
    }),
  ).rejects.toThrow('not ready');
  const readyThenFailed = [
    { code: 0, stderr: '', stdout: 'ready' },
    { code: 1, stderr: 'missing', stdout: '' },
  ];
  await expect(
    readWithReadyIndex(
      async () => {
        const next = readyThenFailed.shift();
        if (!next) {
          throw new Error('Unexpected CBM command.');
        }
        return next;
      },
      {
        allowedRoots: ['/repo'],
        read: () => cbmCommands.listProjects(),
        root: { index: 'repo', root: '/repo' },
      },
    ),
  ).rejects.toThrow('read failed');
});

test.each([
  ['ready', true],
  ['index complete', true],
  ['not ready', false],
  ['error', false],
] as const)('detects CBM readiness for %s', (output, expected) => {
  expect(indexIsReady(output)).toBe(expected);
});

test('uses staged rg only when CBM reports no matches or fails', async () => {
  const foundOutputs = [
    { code: 0, stderr: '', stdout: 'ready' },
    {
      code: 0,
      stderr: '',
      stdout: '{"total":1,"results":[{"name":"match"}]}',
    },
  ];
  const cbmFound = await searchWithCbmFallback(
    async () => foundOutputs.shift() ?? { code: 1, stderr: '', stdout: '' },
    {
      allowedRoots: ['/repo'],
      query: 'match',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(cbmFound.source).toBe('cbm');
  expect(cbmFound.attempts.map((item) => item.status)).toEqual([
    'found',
    'skipped',
    'skipped',
    'skipped',
  ]);
  const outputs = [
    { code: 0, stderr: '', stdout: 'ready' },
    { code: 0, stderr: '', stdout: '{"total":0,"results":[]}' },
    { code: 1, stderr: '', stdout: '' },
    { code: 0, stderr: '', stdout: '/repo/a.ts:1:match' },
  ];
  const fallback = await searchWithCbmFallback(
    async () => outputs.shift() ?? { code: 1, stderr: '', stdout: '' },
    {
      allowedRoots: ['/repo'],
      query: 'match',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(fallback).toMatchObject({ found: true, source: 'rg' });
  expect(fallback.attempts.map((item) => item.strategy)).toEqual([
    'cbm-search-graph',
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-files',
  ]);
  expect(
    cbmOutputHasMatches('{"total_results":1}\nlevel=info msg=mem.init'),
  ).toBeTrue();
  expect(cbmOutputHasMatches('{"total":0,"results":[]}')).toBeFalse();
  expect(
    cbmOutputHasMatches('{"total":1,"results":[{"name":"token"}]}', 'needle'),
  ).toBeFalse();
  expect(cbmOutputHasMatches('not-json')).toBeFalse();
  expect(cbmOutputHasMatches('{bad}')).toBeFalse();
  const cbmFailure = await searchWithCbmFallback(
    async (spec) =>
      spec.args.includes('index_status')
        ? { code: 1, stderr: 'CBM unavailable', stdout: '' }
        : { code: 0, stderr: '', stdout: '/repo/match.ts:1:match' },
    {
      allowedRoots: ['/repo'],
      query: 'match',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(cbmFailure).toMatchObject({ found: true, source: 'rg' });
  expect(cbmFailure.attempts[0]?.status).toBe('error');
});
