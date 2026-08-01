import { expect, mock, test } from 'bun:test';

import {
  assertAllowedCbmRoot,
  assertKnownCbmProject,
  cbmCommands,
  cbmOutputHasMatches,
  cbmProjectForRoot,
  cbmProjectNames,
  indexIsReady,
  readWithReadyIndex,
  resolveCbmProjectForRoot,
  searchWithCbmFallback,
} from '../../utils/codebase-memory.js';

test('accepts only a CBM project name returned by the project list', () => {
  const projects = '{"projects":[{"name":"Users-rhuang"},{"name":"Bento"}]}';
  expect(cbmProjectNames(projects)).toEqual(['Users-rhuang', 'Bento']);
  expect(() => assertKnownCbmProject('Bento', projects)).not.toThrow();
  expect(() => assertKnownCbmProject('made-up', projects)).toThrow(
    'not a listed',
  );
});

test('resolves a project only from an explicit indexed-root mapping', () => {
  const projects = JSON.stringify({
    projects: [
      { name: 'Users-rhuang', repository_path: '/Users/rhuang' },
      {
        name: 'Users-rhuang-Github-bento',
        repository_path: '/Users/rhuang/Github/bento',
      },
    ],
  });
  expect(cbmProjectForRoot('/Users/rhuang/tmp-sum-app', projects)).toBe(
    'Users-rhuang',
  );
  expect(cbmProjectForRoot('/Users/rhuang/Github/bento/src', projects)).toBe(
    'Users-rhuang-Github-bento',
  );
  expect(() => cbmProjectForRoot('/other', projects)).toThrow(
    'explicit indexed root',
  );
  expect(() =>
    cbmProjectForRoot(
      '/Users/rhuang/tmp-sum-app',
      '{"projects":[{"name":"Users-rhuang"}]}',
    ),
  ).toThrow('explicit indexed root');
  expect(() =>
    cbmProjectForRoot(
      '/Users/rhuang/tmp-sum-app',
      JSON.stringify({
        projects: [
          { name: 'one', repository_path: '/Users/rhuang' },
          { name: 'two', repository_path: '/Users/rhuang' },
        ],
      }),
    ),
  ).toThrow('Multiple CBM projects');
  expect(() => cbmProjectForRoot('/Users/rhuang/tmp-sum-app', '{')).toThrow(
    'explicit indexed root',
  );
});

test('resolves the index in-process from the single project-list command', async () => {
  const execute = mock(async () => ({
    code: 0,
    stderr: '',
    stdout: JSON.stringify({
      projects: [
        { name: 'home', repository_path: '/Users/rhuang' },
        { name: 'repo', repository_path: '/Users/rhuang/Github/repo' },
      ],
    }),
  }));
  await expect(
    resolveCbmProjectForRoot('/Users/rhuang/Github/repo/src', execute),
  ).resolves.toBe('repo');
  expect(execute).toHaveBeenCalledTimes(1);
  await expect(
    resolveCbmProjectForRoot('/Users/rhuang', async () => ({
      code: 1,
      stderr: 'offline',
      stdout: '',
    })),
  ).rejects.toThrow('project list is unavailable');
});

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
