import { expect, mock, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertAllowedRepoSearchRoot,
  assertKnownRepoSearchProject,
  indexIsReady,
  inspectRepoSearch,
  parseRepoSearchInspectionJsonl,
  readWithReadyIndex,
  repoSearchCommands,
  repoSearchGraphIdentityFields,
  repoSearchInspectionCommand,
  repoSearchOutputHasMatches,
  repoSearchProjectForRoot,
  repoSearchProjectNames,
  resolveRepoSearchProjectForRoot,
  searchWithRepoSearchFallback,
} from '../../utils/repo-search.js';

const HOME_ROOT = join(tmpdir(), 'repo-search-home');
const REPO_ROOT = join(HOME_ROOT, 'Github', 'repo');
const APP_ROOT = join(HOME_ROOT, 'tmp-app');

test('accepts only a repo-search project name returned by the project list', () => {
  const projects = '{"projects":[{"name":"home-index"},{"name":"Bento"}]}';
  expect(repoSearchProjectNames(projects)).toEqual(['home-index', 'Bento']);
  expect(() => assertKnownRepoSearchProject('Bento', projects)).not.toThrow();
  expect(() => assertKnownRepoSearchProject('made-up', projects)).toThrow('not a listed');
});

test('resolves a project only from an explicit indexed-root mapping', () => {
  const projects = JSON.stringify({
    projects: [
      { name: 'home-index', repository_path: HOME_ROOT },
      {
        name: 'home-index-Github-bento',
        repository_path: join(HOME_ROOT, 'Github', 'bento'),
      },
    ],
  });
  expect(repoSearchProjectForRoot(APP_ROOT, projects)).toBe('home-index');
  expect(repoSearchProjectForRoot(join(HOME_ROOT, 'Github', 'bento', 'src'), projects)).toBe(
    'home-index-Github-bento',
  );
  expect(() => repoSearchProjectForRoot('/other', projects)).toThrow('explicit indexed root');
  expect(() => repoSearchProjectForRoot(APP_ROOT, '{"projects":[{"name":"home-index"}]}')).toThrow(
    'explicit indexed root',
  );
  expect(() =>
    repoSearchProjectForRoot(
      APP_ROOT,
      JSON.stringify({
        projects: [
          { name: 'one', repository_path: HOME_ROOT },
          { name: 'two', repository_path: HOME_ROOT },
        ],
      }),
    ),
  ).toThrow('Multiple repo-search projects');
  expect(() => repoSearchProjectForRoot(APP_ROOT, '{')).toThrow('explicit indexed root');
  const withExact = JSON.stringify({
    projects: [
      { name: 'home-index', repository_path: HOME_ROOT },
      { name: 'tmp', repository_path: APP_ROOT },
    ],
  });
  expect(repoSearchProjectForRoot(APP_ROOT, withExact)).toBe('tmp');
});

test('ignores malformed and incomplete project-list entries', () => {
  for (const output of [
    '{"projects":{}}',
    '{"projects":[null, 1, {"name":""}, {"name":"repo"}]}',
  ]) {
    expect(() => repoSearchProjectForRoot('/repo', output)).toThrow('explicit indexed root');
  }
  expect(() => repoSearchProjectForRoot('/repo', '{')).toThrow('explicit indexed root');
});

test('resolves the index in-process from the single project-list command', async () => {
  const execute = mock(async () => ({
    code: 0,
    stderr: '',
    stdout: JSON.stringify({
      projects: [
        { name: 'home', repository_path: HOME_ROOT },
        { name: 'repo', repository_path: REPO_ROOT },
      ],
    }),
  }));
  await expect(resolveRepoSearchProjectForRoot(join(REPO_ROOT, 'src'), execute)).resolves.toBe(
    'repo',
  );
  expect(execute).toHaveBeenCalledTimes(1);
  await expect(
    resolveRepoSearchProjectForRoot(HOME_ROOT, async () => ({
      code: 1,
      stderr: 'offline',
      stdout: '',
    })),
  ).rejects.toThrow('project list is unavailable');
});

test('resolves the exact project identity without checking or substituting its index', async () => {
  const projectList = JSON.stringify({
    projects: [
      { name: 'home', repository_path: HOME_ROOT },
      { name: 'tmp-sum-app', repository_path: APP_ROOT },
    ],
  });
  const execute = mock(async () => ({
    code: 0,
    stderr: '',
    stdout: projectList,
  }));
  await expect(resolveRepoSearchProjectForRoot(APP_ROOT, execute)).resolves.toBe('tmp-sum-app');
  expect(execute).toHaveBeenCalledTimes(1);
});

test('builds CLI-only repo-search command specifications', () => {
  expect(repoSearchCommands.listProjects()).toEqual({
    args: ['cli', 'list_projects'],
    command: 'codebase-memory-mcp',
    environment: { REPO_SEARCH_LOG_LEVEL: 'error' },
  });
  expect(repoSearchCommands.indexRepository('/repo', 'repo')).toEqual({
    args: ['cli', 'index_repository', '--repo-path', '/repo', '--name', 'repo', '--mode', 'full'],
    command: 'codebase-memory-mcp',
    environment: { REPO_SEARCH_LOG_LEVEL: 'error' },
  });
  expect(repoSearchCommands.searchGraph('repo', 'service', 5).args).toContain('--query');
  expect(repoSearchCommands.searchGraph('repo', 'service', 5).environment).toEqual({
    REPO_SEARCH_LOG_LEVEL: 'error',
  });
  expect(repoSearchCommands.getArchitecture('repo').args).toContain('--path');
  expect(repoSearchCommands.getCodeSnippet('repo', 'a.b').args).toContain('--qualified-name');
  expect(repoSearchCommands.getGraphSchema('repo').args).toContain('get_graph_schema');
  expect(repoSearchCommands.queryGraph('repo', 'MATCH', 3).args).toContain('--max-rows');
  expect(repoSearchCommands.searchCode('repo', 'literal', 3).args).toContain('compact');
  expect(repoSearchCommands.searchGraphByName('repo', '.*A.*', 'Function', 3).args).toContain(
    '--name-pattern',
  );
  expect(repoSearchCommands.tracePath('repo', 'a.b', 'inbound', 2).args).toContain('calls');
});

test('parses fixed local JSONL inspection requests and renders only repo-search flags', () => {
  const operations = parseRepoSearchInspectionJsonl(
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
  if (!searchGraph) {
    throw new Error('Expected search-graph inspection operation.');
  }
  expect(repoSearchInspectionCommand('repo', searchGraph).args).toEqual([
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
  expect(() => parseRepoSearchInspectionJsonl('')).toThrow('at least one JSONL');
  expect(() => parseRepoSearchInspectionJsonl('{"operation":"unknown"}')).toThrow('Unsupported');
  expect(() =>
    parseRepoSearchInspectionJsonl(
      '{"operation":"trace","qualifiedName":"repo.f","direction":"both","depth":3}',
    ),
  ).toThrow('direction');
  expect(() => parseRepoSearchInspectionJsonl('[]')).toThrow('must be an object');
  expect(() => parseRepoSearchInspectionJsonl('{"operation":""}')).toThrow('non-empty string');
  expect(() => parseRepoSearchInspectionJsonl('{"operation":"architecture"}')).toThrow(
    'architecture path',
  );
  expect(() =>
    parseRepoSearchInspectionJsonl('{"operation":"search-code","pattern":"value","limit":0}'),
  ).toThrow('positive integer');
  expect(() => parseRepoSearchInspectionJsonl('not-json')).toThrow('line 1');
});

test('maps every declared inspection operation to one flag-based CLI specification', () => {
  const operations = parseRepoSearchInspectionJsonl(
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
    operations.map((operation) => repoSearchInspectionCommand('repo', operation).args[1]),
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
  const receipt = await inspectRepoSearch(execute, { index: 'repo', root: '/repo' }, [
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
  const receipt = await inspectRepoSearch(execute, { index: 'repo', root: '/repo' }, [
    { operation: 'schema' },
  ]);
  expect(receipt).toMatchObject({ ready: false });
  expect(receipt.entries).toHaveLength(1);
  expect(execute).toHaveBeenCalledTimes(1);
});

test('indexes one allowed root then retries the requested repo-search read once', async () => {
  const results = [
    { code: 0, stderr: '', stdout: 'not ready' },
    { code: 0, stderr: '', stdout: 'index complete' },
    { code: 0, stderr: '', stdout: 'ready' },
    { code: 0, stderr: '', stdout: 'result' },
  ];
  const result = await readWithReadyIndex(
    async () => results.shift() ?? { code: 1, stderr: 'unexpected', stdout: '' },
    {
      allowedRoots: ['/repo', '/home', '/kb'],
      read: (project) => repoSearchCommands.searchGraph(project, 'symbol', 5),
      root: { index: 'repo', root: '/repo/' },
    },
  );
  expect(result).toEqual({ indexed: true, output: 'result', project: 'repo' });
  assertAllowedRepoSearchRoot('/home', ['/repo', '/home']);
  expect(() => assertAllowedRepoSearchRoot('/other', ['/repo'])).toThrow('not allowed');
});

test('reports failed indexing, readiness, and read results', async () => {
  const failure = async () => ({ code: 1, stderr: 'bad', stdout: '' });
  await expect(
    readWithReadyIndex(failure, {
      allowedRoots: ['/repo'],
      read: () => repoSearchCommands.listProjects(),
      root: { index: 'repo', root: '/repo' },
    }),
  ).rejects.toThrow('indexing');
  const notReady = async () => ({ code: 0, stderr: '', stdout: 'not ready' });
  await expect(
    readWithReadyIndex(notReady, {
      allowedRoots: ['/repo'],
      read: () => repoSearchCommands.listProjects(),
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
          throw new Error('Unexpected repo-search command.');
        }
        return next;
      },
      {
        allowedRoots: ['/repo'],
        read: () => repoSearchCommands.listProjects(),
        root: { index: 'repo', root: '/repo' },
      },
    ),
  ).rejects.toThrow('read failed');
});

test('does not create a repo-search index during search fallback', async () => {
  const commands: string[][] = [];
  const execute = mock(async (command: { args: readonly string[] }) => {
    commands.push([...command.args]);
    const operation = command.args[1];
    if (operation === 'index_status') {
      return { code: 0, stderr: '', stdout: 'not ready' };
    }
    if (operation === 'search_graph') {
      return { code: 0, stderr: '', stdout: '' };
    }
    if (command.args.includes('--line-number')) {
      return {
        code: 0,
        stderr: '',
        stdout: '/kb/browser-testing.md:1:browser testing',
      };
    }
    if (command.args.includes('--files')) {
      return { code: 0, stderr: '', stdout: '/kb/browser-testing.md' };
    }
    return { code: 1, stderr: '', stdout: '' };
  });

  await expect(
    searchWithRepoSearchFallback(execute, {
      allowedRoots: ['/kb'],
      query: 'browser testing',
      root: { index: 'kb-index', root: '/kb' },
    }),
  ).resolves.toMatchObject({ found: true, source: 'rg' });
  expect(commands.some((args) => args.includes('index_repository'))).toBeFalse();
});

test('rejects an empty repo-search fallback query before invoking the executor', async () => {
  const execute = mock(async () => ({ code: 0, stderr: '', stdout: '' }));
  await expect(
    searchWithRepoSearchFallback(execute, {
      allowedRoots: ['/repo'],
      query: '  ',
      root: { index: 'repo', root: '/repo' },
    }),
  ).rejects.toThrow('Search query is required');
  expect(execute).not.toHaveBeenCalled();
});

test.each([
  ['ready', true],
  ['index complete', true],
  ['not ready', false],
  ['error', false],
] as const)('detects repo-search readiness for %s', (output, expected) => {
  expect(indexIsReady(output)).toBe(expected);
});

test('uses repo-search code search before staged rg when graph search has no match', async () => {
  const foundOutputs = [
    { code: 0, stderr: '', stdout: 'ready' },
    {
      code: 0,
      stderr: '',
      stdout: '{"total":1,"results":[{"name":"match"}]}',
    },
  ];
  const repoSearchFound = await searchWithRepoSearchFallback(
    async () => foundOutputs.shift() ?? { code: 1, stderr: '', stdout: '' },
    {
      allowedRoots: ['/repo'],
      query: 'match',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(repoSearchFound.source).toBe('repo-search');
  expect(repoSearchFound.attempts.map((item) => item.status)).toEqual([
    'found',
    'skipped',
    'skipped',
    'skipped',
    'skipped',
  ]);
  const outputs = [
    { code: 0, stderr: '', stdout: 'ready' },
    { code: 0, stderr: '', stdout: '{"total":0,"results":[]}' },
    { code: 0, stderr: '', stdout: '{"total_results":0,"results":[]}' },
    { code: 1, stderr: '', stdout: '' },
    { code: 0, stderr: '', stdout: '/repo/a.ts:1:match' },
  ];
  const fallback = await searchWithRepoSearchFallback(
    async () => outputs.shift() ?? { code: 1, stderr: '', stdout: '' },
    {
      allowedRoots: ['/repo'],
      query: 'match',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(fallback).toMatchObject({ found: true, source: 'rg' });
  expect(fallback.attempts.map((item) => item.strategy)).toEqual([
    'repo-search-graph',
    'repo-search-code',
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-files',
  ]);
  expect(repoSearchOutputHasMatches('{"total_results":1}\nlevel=info msg=mem.init')).toBeTrue();
  expect(repoSearchOutputHasMatches('{"total":0,"results":[]}')).toBeFalse();
  expect(
    repoSearchOutputHasMatches('{"total":1,"results":[{"name":"token"}]}', 'needle'),
  ).toBeFalse();
  expect(repoSearchOutputHasMatches('not-json')).toBeFalse();
  expect(repoSearchOutputHasMatches('{bad}')).toBeFalse();
  const codeFound = await searchWithRepoSearchFallback(
    async (spec) => {
      if (spec.args.includes('index_status')) {
        return { code: 0, stderr: '', stdout: 'ready' };
      }
      if (spec.args.includes('search_graph')) {
        return { code: 0, stderr: '', stdout: '{"total":0,"results":[]}' };
      }
      return {
        code: 0,
        stderr: '',
        stdout: '{"total_results":1,"results":[{"file":"browser-testing.md","match_lines":[10]}]}',
      };
    },
    {
      allowedRoots: ['/repo'],
      query: 'browser testing',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(codeFound).toMatchObject({ found: true, source: 'repo-search' });
  expect(codeFound.attempts.map((item) => item.strategy)).toEqual([
    'repo-search-graph',
    'repo-search-code',
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-files',
  ]);
  const graphError = await searchWithRepoSearchFallback(
    async (spec) => {
      if (spec.args.includes('index_status')) {
        return { code: 0, stderr: '', stdout: 'ready' };
      }
      if (spec.args.includes('search_graph')) {
        throw new Error('repo-search graph request failed');
      }
      return { code: 1, stderr: '', stdout: '' };
    },
    {
      allowedRoots: ['/repo'],
      query: 'match',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(graphError.attempts[0]).toMatchObject({ status: 'error' });
  const repoSearchFailure = await searchWithRepoSearchFallback(
    async (spec) =>
      spec.args.includes('index_status')
        ? { code: 1, stderr: 'repo-search unavailable', stdout: '' }
        : { code: 0, stderr: '', stdout: '/repo/match.ts:1:match' },
    {
      allowedRoots: ['/repo'],
      query: 'match',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(repoSearchFailure).toMatchObject({ found: true, source: 'rg' });
  expect(repoSearchFailure.attempts[0]?.status).toBe('error');
});

test('normalizes one padded query for repo-search graph and code searches', async () => {
  const commands: string[][] = [];
  const result = await searchWithRepoSearchFallback(
    async (spec) => {
      commands.push([...spec.args]);
      if (spec.args.includes('index_status')) {
        return { code: 0, stderr: '', stdout: 'ready' };
      }
      if (spec.args.includes('search_graph')) {
        return { code: 0, stderr: '', stdout: '{"total":0,"results":[]}' };
      }
      if (spec.args.includes('search_code')) {
        return {
          code: 0,
          stderr: '',
          stdout: '{"total_results":0,"results":[]}',
        };
      }
      return { code: 1, stderr: '', stdout: '' };
    },
    {
      allowedRoots: ['/repo'],
      query: '  needle  ',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(result).toMatchObject({ found: false, source: 'none' });
  expect(
    commands
      .filter((args) => args.includes('--query'))
      .map((args) => args[args.indexOf('--query') + 1]),
  ).toEqual(['needle']);
  expect(
    commands
      .filter((args) => args.includes('--pattern'))
      .map((args) => args[args.indexOf('--pattern') + 1]),
  ).toEqual(['needle']);
});

test('rejects graph matches that contain the query only in unrelated metadata', async () => {
  const result = await searchWithRepoSearchFallback(
    async (spec) => {
      if (spec.args.includes('index_status')) {
        return { code: 0, stderr: '', stdout: 'ready' };
      }
      if (spec.args.includes('search_graph')) {
        return {
          code: 0,
          stderr: '',
          stdout: '{"total":1,"results":[{"name":"unrelated","description":"needle"}]}',
        };
      }
      if (spec.args.includes('search_code')) {
        return {
          code: 0,
          stderr: '',
          stdout: '{"total_results":0,"results":[]}',
        };
      }
      return { code: 1, stderr: '', stdout: '' };
    },
    {
      allowedRoots: ['/repo'],
      query: 'needle',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(result).toMatchObject({ found: false, source: 'none' });
  expect(result.attempts.map((attempt) => attempt.strategy)).toEqual([
    'repo-search-graph',
    'repo-search-code',
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-files',
  ]);
});

test('accepts graph matches in structured identity fields', async () => {
  const result = await searchWithRepoSearchFallback(
    async (spec) => {
      if (spec.args.includes('index_status')) {
        return { code: 0, stderr: '', stdout: 'ready' };
      }
      if (spec.args.includes('search_graph')) {
        return {
          code: 0,
          stderr: '',
          stdout: '{"total":1,"results":[{"file_path":"src/needle.ts"}]}',
        };
      }
      return { code: 1, stderr: '', stdout: '' };
    },
    {
      allowedRoots: ['/repo'],
      query: 'needle',
      root: { index: 'repo', root: '/repo' },
    },
  );
  expect(result).toMatchObject({ found: true, source: 'repo-search' });
  expect(result.attempts.map((attempt) => attempt.status)).toEqual([
    'found',
    'skipped',
    'skipped',
    'skipped',
    'skipped',
  ]);
});

test('requires structured graph identity fields for query-aware matching', () => {
  expect(repoSearchGraphIdentityFields).toEqual(['name', 'qualified_name', 'file_path', 'path']);
  expect(
    repoSearchOutputHasMatches('{"total":1,"results":[{"description":"needle"}]}', 'needle'),
  ).toBeFalse();
  expect(
    repoSearchOutputHasMatches(
      '{"total":1,"results":[{"qualified_name":"repo.needle"}]}',
      'needle',
    ),
  ).toBeTrue();
  expect(
    repoSearchOutputHasMatches('{"total":2,"results":[null,{"path":"src/needle.ts"}]}', 'needle'),
  ).toBeTrue();
});
