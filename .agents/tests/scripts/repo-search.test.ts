import { expect, mock, test } from 'bun:test';

import {
  commandFor,
  run,
  runWhenMain,
  usage,
} from '../../scripts/repo-search.js';

test.each([
  [['list-projects'], 'list_projects'],
  [['index-status', 'repo'], 'index_status'],
  [['architecture', 'repo'], 'get_architecture'],
  [['schema', 'repo'], 'get_graph_schema'],
  [['snippet', 'repo', 'a.b'], 'get_code_snippet'],
  [['search-graph', 'repo', 'symbol', '2'], 'search_graph'],
  [['search-code', 'repo', 'text', '2'], 'search_code'],
  [['query', 'repo', 'MATCH', '2'], 'query_graph'],
  [['trace', 'repo', 'a.b', 'outbound', '2'], 'trace_path'],
] as const)(
  'renders %s through the repo-search CLI only',
  async (args, operation) => {
    expect(commandFor(args).args).toContain(operation);
    const write = mock();
    await run(args, write);
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'REPO_SEARCH_LOG_LEVEL=error codebase-memory-mcp cli',
      ),
    );
  },
);

test('renders query through the dedicated graph-query branch', () => {
  expect(commandFor(['query', 'repo', 'MATCH', '2']).args).toEqual([
    'cli',
    'query_graph',
    '--project',
    'repo',
    '--query',
    'MATCH',
    '--max-rows',
    '2',
  ]);
});

test('runs discovery through the shared repo-search fallback boundary', async () => {
  const write = mock();
  const search = mock(async () => ({
    attempts: [],
    found: false,
    output: '',
    source: 'none' as const,
  }));
  await run(
    ['discover', '/repo', 'repo', 'needle'],
    write,
    search,
    undefined,
    async () => 'repo',
  );
  expect(search).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ query: 'needle' }),
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"source"'));
});

test('accepts path-only discovery and resolves the index internally', async () => {
  const write = mock();
  const search = mock(async () => ({
    attempts: [],
    found: true,
    output: 'indexed match',
    source: 'repo-search' as const,
  }));
  const resolve = mock(async () => 'resolved-project');
  await run(['/repo', 'needle'], write, search, undefined, resolve);
  expect(resolve).toHaveBeenCalledWith('/repo', expect.anything());
  expect(search).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      allowedRoots: ['/repo'],
      query: 'needle',
      root: { index: 'resolved-project', root: '/repo' },
    }),
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('indexed match'));
});

test('batches independent path-only queries in parallel after resolving the index once', async () => {
  const write = mock();
  const calls: string[] = [];
  const search = mock(async (_executor, request) => {
    calls.push(request.query);
    return {
      attempts: [],
      found: true,
      output: request.query,
      source: 'repo-search' as const,
    };
  });
  const resolve = mock(async () => 'resolved-project');

  await run(
    ['/repo', 'first', 'second', 'third'],
    write,
    search,
    undefined,
    resolve,
  );

  expect(resolve).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledTimes(3);
  expect(calls).toEqual(['first', 'second', 'third']);
  expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toHaveLength(3);
});

test('keeps path-only discovery on the same receipt boundary when index resolution fails', async () => {
  const write = mock();
  const search = mock(async () => ({
    attempts: [],
    found: true,
    output: 'fallback match',
    source: 'rg' as const,
  }));
  await run(['/path', 'needle'], write, search, undefined, async () => {
    throw new Error('no matching project');
  });
  expect(search).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      allowedRoots: ['/path'],
      query: 'needle',
      root: { index: '__repo_search_index_unresolved__', root: '/path' },
    }),
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('fallback match'));
});

test('serves discovery through the fallback boundary when the index is absent', async () => {
  const write = mock();
  const fallback = mock(async () => ({
    attempts: [],
    found: true,
    output: '/path/.hidden.ts:1:needle',
    source: 'rg' as const,
  }));
  await run(['discover', '/path', 'repo', 'needle'], write, fallback);
  expect(fallback).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      allowedRoots: ['/path'],
      query: 'needle',
      root: { index: 'repo', root: '/path' },
    }),
  );
  const receipt = JSON.parse(String(write.mock.calls[0]?.[0])) as {
    readonly attempts: readonly { readonly strategy: string }[];
    readonly found: boolean;
  };
  expect(receipt.found).toBeTrue();
  expect(receipt.attempts).toEqual([]);
});

test('runs a typed inspection from an OS-temporary JSONL handoff in one receipt', async () => {
  const write = mock();
  const read = mock(
    async () =>
      '{"operation":"architecture","path":""}\n{"operation":"schema"}',
  );
  const resolve = mock(async () => 'repo');
  const inspect = mock(async () => ({
    entries: [],
    project: 'repo',
    ready: true,
    root: '/repo',
  }));
  await run(
    ['inspect', '/repo', '/os-temp/repo-search/request.jsonl'],
    write,
    undefined,
    read,
    resolve,
    inspect,
    '/os-temp',
  );
  expect(resolve).toHaveBeenCalledWith('/repo', expect.anything());
  expect(read).toHaveBeenCalledWith('/os-temp/repo-search/request.jsonl');
  expect(inspect).toHaveBeenCalledWith(
    expect.anything(),
    { index: 'repo', root: '/repo' },
    expect.arrayContaining([{ operation: 'architecture', path: '' }]),
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"ready"'));
});

test('rejects an inspection request outside the OS temporary directory', async () => {
  await expect(
    run(
      ['inspect', '/repo', '/project/request.jsonl'],
      mock(),
      undefined,
      async () => '',
      async () => 'repo',
      async () => ({
        entries: [],
        project: 'repo',
        ready: true,
        root: '/repo',
      }),
      '/os-temp',
    ),
  ).rejects.toThrow('OS temporary directory');
});

test('rejects invalid repo-search command shapes and guards the main boundary', async () => {
  expect(() => commandFor(['search-code', 'repo', 'x', '0'])).toThrow(usage());
  expect(() => commandFor(['trace', 'repo', 'a.b', 'both', '2'])).toThrow(
    usage(),
  );
  await expect(run([])).rejects.toThrow(usage());
  const runner = mock();
  runWhenMain(true, ['list-projects'], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
