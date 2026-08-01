import { expect, mock, test } from 'bun:test';

import {
  assertAllowedCbmRoot,
  assertKnownCbmProject,
  cbmCommands,
  cbmInspectionCommand,
  cbmOutputHasMatches,
  cbmProjectForRoot,
  cbmProjectNames,
  indexIsReady,
  inspectCbm,
  parseCbmInspectionJsonl,
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
  expect(cbmCommands.getArchitecture('repo').args).toContain('--path');
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

test('parses fixed local JSONL inspection requests and renders only CBM flags', () => {
  const operations = parseCbmInspectionJsonl(
    [
      '{"operation":"architecture","path":""}',
      '{"operation":"search-graph","namePattern":".*inspect.*","label":"Function","limit":20}',
      '{"operation":"snippet","qualifiedName":"repo.utils.inspect"}',
      '{"operation":"trace","qualifiedName":"repo.utils.inspect","direction":"inbound","depth":3}',
      '{"operation":"search-code","pattern":"inspection","limit":20}',
    ].join('\n'),
  );
  expect(operations).toHaveLength(5);
  const searchGraph = operations.at(1);
  expect(searchGraph).toBeDefined();
  if (!searchGraph)
    throw new Error('Expected search-graph inspection operation.');
  expect(cbmInspectionCommand('repo', searchGraph).args).toEqual([
    'cli',
    'search_graph',
    '--project',
    'repo',
    '--name-pattern',
    '.*inspect.*',
    '--label',
    'Function',
    '--limit',
    '20',
  ]);
  expect(() => parseCbmInspectionJsonl('')).toThrow('at least one JSONL');
  expect(() => parseCbmInspectionJsonl('{"operation":"unknown"}')).toThrow(
    'Unsupported',
  );
  expect(() =>
    parseCbmInspectionJsonl(
      '{"operation":"trace","qualifiedName":"repo.f","direction":"both","depth":3}',
    ),
  ).toThrow('direction');
  expect(() => parseCbmInspectionJsonl('[]')).toThrow('must be an object');
  expect(() => parseCbmInspectionJsonl('{"operation":""}')).toThrow(
    'non-empty string',
  );
  expect(() => parseCbmInspectionJsonl('{"operation":"architecture"}')).toThrow(
    'architecture path',
  );
  expect(() =>
    parseCbmInspectionJsonl(
      '{"operation":"search-code","pattern":"value","limit":0}',
    ),
  ).toThrow('positive integer');
  expect(() => parseCbmInspectionJsonl('not-json')).toThrow('line 1');
});

test('maps every declared inspection operation to one flag-based CLI specification', () => {
  const operations = parseCbmInspectionJsonl(
    [
      '{"operation":"architecture","path":"src"}',
      '{"operation":"schema"}',
      '{"operation":"search-graph","namePattern":".*a.*","label":"Function","limit":1}',
      '{"operation":"snippet","qualifiedName":"repo.a"}',
      '{"operation":"trace","qualifiedName":"repo.a","direction":"outbound","depth":1}',
      '{"operation":"search-code","pattern":"needle","limit":1}',
    ].join('\n'),
  );
  expect(
    operations.map(
      (operation) => cbmInspectionCommand('repo', operation).args[1],
    ),
  ).toEqual([
    'get_architecture',
    'get_graph_schema',
    'search_graph',
    'get_code_snippet',
    'trace_path',
    'search_code',
  ]);
});

test('checks readiness once and concurrently returns every requested read receipt', async () => {
  const execute = mock(async (spec) => {
    if (spec.args.includes('index_status')) {
      return { code: 0, stderr: '', stdout: 'ready' };
    }
    return {
      code: spec.args.includes('get_code_snippet') ? 1 : 0,
      stderr: '',
      stdout: spec.args.join(' '),
    };
  });
  const receipt = await inspectCbm(execute, { index: 'repo', root: '/repo' }, [
    { operation: 'architecture', path: '' },
    { operation: 'snippet', qualifiedName: 'repo.utils.inspect' },
  ]);
  expect(receipt).toMatchObject({
    project: 'repo',
    ready: true,
    root: '/repo',
  });
  expect(receipt.entries.map((entry) => entry.operation)).toEqual([
    'index-status',
    'architecture',
    'snippet',
  ]);
  expect(receipt.entries[2]).toMatchObject({ code: 1 });
  expect(execute).toHaveBeenCalledTimes(3);
});

test('does not index, retry, or read declared operations when status is unavailable', async () => {
  const execute = mock(async () => ({
    code: 0,
    stderr: '',
    stdout: 'not ready',
  }));
  const receipt = await inspectCbm(execute, { index: 'repo', root: '/repo' }, [
    { operation: 'schema' },
  ]);
  expect(receipt).toMatchObject({ ready: false });
  expect(receipt.entries).toHaveLength(1);
  expect(execute).toHaveBeenCalledTimes(1);
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
