import { expect, mock, test } from 'bun:test';
import { homedir } from 'node:os';

import type { CommandExecutor } from '../../utils/process.js';
import {
  assertAllowedRepoSearchRoot,
  parseIndexStatus,
  parseListProjects,
  parseSearchCode,
  parseSearchGraph,
  readTargetShape,
  repoSearchDiscover,
  repoSearchProjectForRoot,
  repoSearchRead,
  resolveRepoSearchIndex,
  tokenizeBackendRow,
} from '../../utils/repo-search.js';
import type {
  RepoSearchBackendCall,
  RepoSearchBackendResult,
  RepoSearchTransport,
} from '../../utils/repo-search-transport.js';
import type { SearchAttempt } from '../../utils/search-fallback.js';

const projectsTable = [
  'projects: 3  (cols: name root_path branch)',
  '  repo /repo main',
  '  nested /repo/nested main',
  '  spaced "/repo/with space" main',
  'total: 3',
  'returned: 3',
  'has_more: false',
  '',
].join('\n');

const readyStatus = [
  'project: repo',
  'nodes: 1',
  'edges: 1',
  'status: ready',
  'root_path: /repo',
  'indexed_at: 2026-09-25T08:22:24Z',
  'parse_partial:',
  '  files: 0',
  '',
].join('\n');

const notReadyStatus = 'project: repo\nstatus: not ready\n';

const graphTable = [
  'results: 2  (cols: qn label file lines rank)',
  '  repo.src.needle Function src/needle.ts 10-20 -1.0',
  '  repo.src.unrelated Function src/unrelated.ts 1-2 -2.0',
  'total: 2',
  'has_more: false',
  '',
].join('\n');

const twoSymbolGraphTable = [
  'results: 2  (cols: qn label file lines rank)',
  '  repo.src.needle Function src/needle.ts 10-20 -1.0',
  '  repo.src.thread Function src/thread.ts 5-9 -2.0',
  'total: 2',
  'has_more: true',
  '',
].join('\n');

const codeTable = [
  'results: 1  (cols: qn label file lines matches matches_omitted in out)',
  '  repo.src.needle Function src/needle.ts 10-20 12 0 1 0',
  'directories: 2  (cols: dir hits)',
  '  src/ 3',
  '  tests/ 1',
  'total_results: 1',
  'has_more: false',
  '',
].join('\n');

const backendError = (text: string): RepoSearchBackendResult => ({
  error: text,
  isError: true,
  text,
});

const backendText = (text: string): RepoSearchBackendResult => ({
  error: null,
  isError: false,
  text,
});

const executorFor = (stdout: string, code = 0) =>
  mock(async () => ({ code, stderr: '', stdout })) as unknown as CommandExecutor;

const fakeTransport = (
  handler: (call: RepoSearchBackendCall) => RepoSearchBackendResult | Error,
  kind: 'cli' | 'mcp' = 'mcp',
): RepoSearchTransport => ({
  call: mock(async (call: RepoSearchBackendCall) => {
    const answered = handler(call);
    if (answered instanceof Error) {
      throw answered;
    }
    return answered;
  }),
  close: mock(async () => undefined),
  kind,
});

const toolsTable =
  (tool: string, text: string | ((call: RepoSearchBackendCall) => string)) =>
  (call: RepoSearchBackendCall): RepoSearchBackendResult =>
    call.tool === tool
      ? backendText(typeof text === 'function' ? text(call) : text)
      : backendError(`unexpected tool: ${call.tool}`);

const probeAttempt: SearchAttempt = {
  command: 'codebase-memory-mcp (stdio MCP)',
  detail: 'MCP stdio transport is primary and available (list_projects answered).',
  status: 'found',
  strategy: 'transport-probe',
};

const gateReceipt = (found: boolean, output = '') => ({
  attempts: [
    {
      command: 'probe /repo/a.ts',
      detail: 'magic bytes: mach-o',
      status: 'found' as const,
      strategy: 'binary-gate:classify',
    },
  ],
  found,
  output,
});

test('tokenizes backend table rows and honors quoted segments', () => {
  expect(tokenizeBackendRow('  a /plain/path main')).toEqual(['a', '/plain/path', 'main']);
  expect(tokenizeBackendRow('  spaced "/repo/with space" main')).toEqual([
    'spaced',
    '/repo/with space',
    'main',
  ]);
  expect(tokenizeBackendRow('   ')).toEqual([]);
});

test('parses the project list, index status, and result tables', () => {
  expect(parseListProjects(projectsTable)).toEqual([
    { branch: 'main', name: 'repo', rootPath: '/repo' },
    { branch: 'main', name: 'nested', rootPath: '/repo/nested' },
    { branch: 'main', name: 'spaced', rootPath: '/repo/with space' },
  ]);
  expect(parseListProjects('projects: 0  (cols: name root_path branch)\ntotal: 0')).toEqual([]);
  expect(parseIndexStatus(readyStatus)).toEqual({
    indexedAt: '2026-09-25T08:22:24Z',
    ready: true,
    rootPath: '/repo',
  });
  expect(parseIndexStatus(notReadyStatus).ready).toBeFalse();
  expect(parseSearchGraph(graphTable)).toEqual({
    hasMore: false,
    rows: [
      { file: 'src/needle.ts', lines: '10-20', qn: 'repo.src.needle' },
      { file: 'src/unrelated.ts', lines: '1-2', qn: 'repo.src.unrelated' },
    ],
  });
  expect(parseSearchGraph(twoSymbolGraphTable).hasMore).toBeTrue();
  expect(parseSearchCode(codeTable)).toEqual({
    directories: [
      { dir: 'src/', hits: '3' },
      { dir: 'tests/', hits: '1' },
    ],
    hasMore: false,
    rows: [{ file: 'src/needle.ts', lines: '10-20', qn: 'repo.src.needle' }],
  });
});

test('resolves a project only from an explicit indexed-root mapping', () => {
  const projects = parseListProjects(projectsTable);
  expect(repoSearchProjectForRoot('/repo/src', projects)).toBe('repo');
  expect(repoSearchProjectForRoot('/repo/nested', projects)).toBe('nested');
  expect(() => repoSearchProjectForRoot('/other', projects)).toThrow('explicit indexed root');
  const duplicated = [...projects, { branch: 'main', name: 'twin', rootPath: '/repo/nested' }];
  expect(() => repoSearchProjectForRoot('/repo/nested/a.ts', duplicated)).toThrow(
    'Multiple repo-search projects',
  );
  expect(() => assertAllowedRepoSearchRoot('/other', ['/repo'])).toThrow('not allowed');
  expect(() => assertAllowedRepoSearchRoot('/repo/', ['/repo'])).not.toThrow();
});

test('search answers from the graph stage with located results and reliability', async () => {
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    if (call.tool === 'search_graph') {
      return backendText(graphTable);
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const envelope = await repoSearchDiscover({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    probe: probeAttempt,
    query: 'needle',
    root: '/repo',
    transport,
  });
  expect(envelope).toMatchObject({
    found: true,
    ok: true,
    source: 'graph',
    status: 'found',
    transport: 'mcp',
    verb: 'search',
  });
  expect(envelope.query.index).toBe('repo');
  expect(envelope.reliability.indexedAt).toBe('2026-09-25T08:22:24Z');
  expect(envelope.reliability.caveats).toContain(
    'The indexed snapshot may differ from the working tree.',
  );
  expect(envelope.results).toEqual([
    {
      detail: 'repo.src.needle',
      kind: 'symbol',
      location: 'src/needle.ts:10-20',
      name: 'repo.src.needle',
    },
  ]);
  expect(envelope.attempts.map((attempt) => attempt.strategy)).toEqual([
    'transport-probe',
    'resolve-index',
    'index-status',
    'search-graph',
    'search-code',
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-files',
  ]);
  expect(envelope.next).toEqual(['read <approved-root> <qualified-name> for one snippet']);
});

test('search falls through to code results and clusters when graph has no identity match', async () => {
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    if (call.tool === 'search_graph') {
      return backendText(graphTable);
    }
    if (call.tool === 'search_code') {
      return backendText(codeTable);
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const envelope = await repoSearchDiscover({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    query: 'zebra',
    root: '/repo',
    transport,
  });
  expect(envelope.source).toBe('code');
  expect(envelope.results[0]).toMatchObject({ kind: 'symbol', location: 'src/needle.ts:10-20' });
  expect(envelope.results).toContainEqual({
    detail: '3 matches',
    kind: 'cluster',
    location: 'src/',
    name: 'src/',
  });
});

test('search traces the connection between two named symbols', async () => {
  const traceArgs: string[] = [];
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    if (call.tool === 'search_graph') {
      return backendText(twoSymbolGraphTable);
    }
    if (call.tool === 'trace_path') {
      traceArgs.push(call.args.project ?? '');
      return backendText('hop: caller');
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const envelope = await repoSearchDiscover({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    query: 'needle thread',
    root: '/repo',
    transport,
  });
  expect(envelope.source).toBe('graph');
  const connection = envelope.results.find((result) => result.kind === 'connection');
  expect(connection?.name).toBe('repo.src.needle <-> repo.src.thread');
  expect(connection?.detail).toContain('repo.src.needle inbound:');
  expect(
    envelope.attempts.filter((attempt) => attempt.strategy.startsWith('connect:')),
  ).toHaveLength(4);
  expect([...new Set(traceArgs)]).toEqual(['repo']);
  expect(envelope.reliability.caveats).toContain('Graph results truncated by the search limit.');
});

test('search never indexes and answers from the staged fallback without an index', async () => {
  const calls: string[] = [];
  const transport = fakeTransport((call) => {
    calls.push(call.tool);
    if (call.tool === 'list_projects') {
      return backendText(
        'projects: 1  (cols: name root_path branch)\n  other /other main\ntotal: 1',
      );
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const executor = executorFor('/repo/found.ts:3:needle located');
  const envelope = await repoSearchDiscover(
    {
      allowedRoots: ['/repo'],
      executor,
      query: 'needle',
      root: '/repo',
      transport,
    },
    async () => gateReceipt(false),
  );
  expect(calls).toEqual(['list_projects']);
  expect(envelope).toMatchObject({ found: true, source: 'fallback', status: 'found' });
  expect(envelope.reliability.caveats).toContain(
    'No matching project index; answered from the local staged fallback.',
  );
  expect(envelope.results[0]).toEqual({
    detail: 'needle located',
    kind: 'location',
    location: '/repo/found.ts:3',
    name: null,
  });
});

test('search reports a not-ready index and still answers from the fallback', async () => {
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(notReadyStatus);
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const envelope = await repoSearchDiscover(
    {
      allowedRoots: ['/repo'],
      executor: executorFor('/repo/found.ts:3:needle located'),
      query: 'needle',
      root: '/repo',
      transport,
    },
    async () => gateReceipt(false),
  );
  expect(envelope.source).toBe('fallback');
  expect(envelope.reliability.caveats).toContain(
    'Index not ready; answered from the local staged fallback.',
  );
});

test('search gates binary candidates and reports router evidence', async () => {
  const gate = mock(async () => gateReceipt(true, 'mach-o strings evidence'));
  const envelope = await repoSearchDiscover(
    {
      allowedRoots: ['/repo'],
      executor: executorFor('/repo/tool.bin'),
      query: 'tool',
      root: '/repo',
      transport: null,
    },
    gate,
  );
  expect(envelope).toMatchObject({ found: true, source: 'binary', transport: 'none' });
  expect(envelope.results[0]).toMatchObject({ detail: 'mach-o strings evidence', kind: 'binary' });
  expect(gate).toHaveBeenCalledWith(expect.anything(), {
    candidates: ['/repo/tool.bin'],
    query: 'tool',
  });
  expect(envelope.reliability.caveats).toContain(
    'No backend transport answered; answered from the local staged fallback.',
  );
  expect(envelope.next).toEqual([]);
});

test('search rejects invalid roots and blank queries before any backend call', async () => {
  const transport = fakeTransport(() => backendError('unexpected call'));
  await expect(
    repoSearchDiscover({
      allowedRoots: ['/repo'],
      executor: executorFor(''),
      query: 'needle',
      root: '/other',
      transport,
    }),
  ).rejects.toThrow('not allowed');
  await expect(
    repoSearchDiscover({
      allowedRoots: ['/repo'],
      executor: executorFor(''),
      query: '   ',
      root: '/repo',
      transport,
    }),
  ).rejects.toThrow('Search query is required');
  expect(transport.call).not.toHaveBeenCalled();
});

test('search redacts backend storage paths from every envelope surface', async () => {
  const leak = `${homedir()}/.cache/codebase-memory-mcp/shadow/worktree`;
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    if (call.tool === 'search_graph') {
      return backendText(
        `results: 1  (cols: qn label file lines rank)\n  repo.src.needle Function src/needle.ts 1-2 -1.0\ntotal: 1\n${leak}`,
      );
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const envelope = await repoSearchDiscover({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    query: 'needle',
    root: '/repo',
    transport,
  });
  const serialized = JSON.stringify(envelope);
  expect(serialized).not.toContain('.cache/codebase-memory-mcp');
  expect(serialized).toContain('<backend-store>');
});

test('read classifies targets deterministically', () => {
  expect(readTargetShape('https://example.com')).toBe('url');
  expect(readTargetShape('http://example.com')).toBe('url');
  expect(readTargetShape('12345')).toBe('pid');
  expect(readTargetShape('/repo/file.ts')).toBe('file');
  expect(readTargetShape('repo.src.symbol')).toBe('symbol');
  expect(readTargetShape('Safari')).toBe('process');
});

test('read returns a bounded numbered text fragment for text files', async () => {
  const content = ['one', 'two', 'three', 'four', 'five'].join('\n');
  const headPaths: string[] = [];
  const envelope = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    headReader: mock(async (path: string) => {
      headPaths.push(path);
      return 'plain text head';
    }),
    queries: [],
    readFile: mock(async () => content),
    root: '/repo',
    target: '/repo/file.ts:2-3',
    transport: null,
  });
  expect(headPaths).toEqual(['/repo/file.ts']);
  expect(envelope).toMatchObject({ found: true, source: 'file', status: 'found', verb: 'read' });
  expect(envelope.results[0]).toEqual({
    detail: '2|two\n3|three',
    kind: 'text',
    location: '/repo/file.ts:2-3',
    name: '/repo/file.ts',
  });
  await expect(
    repoSearchRead({
      allowedRoots: ['/repo'],
      executor: executorFor(''),
      headReader: mock(async () => 'x'),
      queries: [],
      readFile: mock(async () => ''),
      root: '/repo',
      target: '/outside/file.ts',
      transport: null,
    }),
  ).rejects.toThrow('outside the approved root');
});

test('read routes binary file targets through the binary router', async () => {
  const machOHead = `${String.fromCharCode(0xcf, 0xfa, 0xed, 0xfe)}binary body`;
  const executor = executorFor('', 1);
  const envelope = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor,
    headReader: mock(async () => machOHead),
    queries: ['strings'],
    readFile: mock(async () => ''),
    root: '/repo',
    target: '/repo/tool.bin',
    transport: null,
  });
  expect(envelope).toMatchObject({ source: 'binary', status: 'empty', transport: 'none' });
  expect(envelope.attempts.map((attempt) => attempt.strategy)).toContain('binary-gate:classify');
  expect(envelope.reliability.caveats).toContain('No routed stage answered the target.');
});

test('read resolves a symbol snippet through the ready index', async () => {
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    if (call.tool === 'get_code_snippet') {
      return backendText('export const needle = 1;');
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const envelope = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    queries: [],
    readFile: mock(async () => ''),
    root: '/repo',
    target: 'repo.src.needle',
    transport,
  });
  expect(envelope).toMatchObject({ found: true, source: 'symbol', status: 'found' });
  expect(envelope.results[0]).toEqual({
    detail: 'export const needle = 1;',
    kind: 'symbol',
    location: null,
    name: 'repo.src.needle',
  });
});

test('read indexes once, re-checks status, and retries the requested read once', async () => {
  const statusOutputs = [notReadyStatus, readyStatus];
  const calls: string[] = [];
  const transport = fakeTransport((call) => {
    calls.push(call.tool);
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(statusOutputs.shift() ?? readyStatus);
    }
    if (call.tool === 'index_repository') {
      return backendText('indexed');
    }
    if (call.tool === 'get_code_snippet') {
      return backendText('snippet body');
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const envelope = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    queries: [],
    readFile: mock(async () => ''),
    root: '/repo',
    target: 'repo.src.needle',
    transport,
  });
  expect(calls).toEqual([
    'list_projects',
    'index_status',
    'index_repository',
    'index_status',
    'get_code_snippet',
  ]);
  expect(envelope).toMatchObject({ found: true, source: 'symbol' });
});

test('read reports a missing snippet as empty and a missing transport as an error', async () => {
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    if (call.tool === 'get_code_snippet') {
      return backendError('function not found');
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const empty = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    queries: [],
    readFile: mock(async () => ''),
    root: '/repo',
    target: 'repo.src.missing',
    transport,
  });
  expect(empty).toMatchObject({ ok: true, status: 'empty' });
  expect(empty.next).toEqual([
    'search <approved-root> repo.src.missing to find the exact qualified name.',
  ]);
  const noTransport = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    queries: [],
    readFile: mock(async () => ''),
    root: '/repo',
    target: 'repo.src.needle',
    transport: null,
  });
  expect(noTransport).toMatchObject({ ok: false, status: 'error', transport: 'none' });
});

test('resolveRepoSearchIndex maps the root and reports resolution failures', async () => {
  const transport = fakeTransport(toolsTable('list_projects', projectsTable));
  await expect(resolveRepoSearchIndex(transport, '/repo/src')).resolves.toEqual({
    attempt: expect.objectContaining({ status: 'found' }),
    index: 'repo',
  });
  const failing = fakeTransport(
    toolsTable('list_projects', 'projects: 0  (cols: name root_path branch)\ntotal: 0'),
  );
  await expect(resolveRepoSearchIndex(failing, '/repo')).resolves.toEqual({
    attempt: expect.objectContaining({ status: 'error' }),
    index: null,
  });
});

test('search records a transport failure when the project list throws', async () => {
  const transport = fakeTransport(() => new Error('backend exploded'));
  const envelope = await repoSearchDiscover(
    {
      allowedRoots: ['/repo'],
      executor: executorFor('/repo/found.ts:3:needle located'),
      query: 'needle',
      root: '/repo',
      transport,
    },
    async () => gateReceipt(false),
  );
  expect(envelope.attempts[0]).toMatchObject({ status: 'error', strategy: 'resolve-index' });
  expect(envelope.reliability.caveats).toContain(
    'Backend project list unavailable; answered from the local staged fallback.',
  );
  expect(envelope.source).toBe('fallback');
});

test('search reports indexed errors and answers from the fallback', async () => {
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    return backendError('backend refused');
  });
  const envelope = await repoSearchDiscover(
    {
      allowedRoots: ['/repo'],
      executor: executorFor('/repo/found.ts:3:needle located'),
      query: 'needle',
      root: '/repo',
      transport,
    },
    async () => gateReceipt(false),
  );
  expect(envelope.attempts.map((attempt) => attempt.strategy)).toEqual([
    'resolve-index',
    'index-status',
    'search-graph',
    'search-code',
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-files',
    'binary-gate:classify',
  ]);
  expect(envelope.reliability.caveats).toContain(
    'Indexed discovery errored; answered from the local staged fallback.',
  );
  expect(envelope.source).toBe('fallback');
});

test('search records truncation caveats from both indexed stages', async () => {
  const truncatedCode = codeTable.replace('has_more: false', 'has_more: true');
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    if (call.tool === 'search_graph') {
      return backendText(graphTable);
    }
    if (call.tool === 'search_code') {
      return backendText(truncatedCode);
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const envelope = await repoSearchDiscover({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    query: 'zebra',
    root: '/repo',
    transport,
  });
  expect(envelope.source).toBe('code');
  expect(envelope.reliability.caveats).toContain('Code results truncated by the search limit.');
});

test('search keeps the connection receipt empty when every trace errors', async () => {
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    if (call.tool === 'search_graph') {
      return backendText(twoSymbolGraphTable);
    }
    return backendError('function not found');
  });
  const envelope = await repoSearchDiscover({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    query: 'needle thread',
    root: '/repo',
    transport,
  });
  expect(envelope.source).toBe('graph');
  expect(envelope.results.some((result) => result.kind === 'connection')).toBeFalse();
  expect(
    envelope.attempts.filter((attempt) => attempt.strategy.startsWith('connect:')),
  ).toHaveLength(4);
});

test('search falls back locally when a ready index has zero hits', async () => {
  const emptyResults = 'results: 0  (cols: qn label file lines rank)\ntotal: 0\nhas_more: false\n';
  const emptyCode =
    'results: 0  (cols: qn label file lines matches matches_omitted in out)\ndirectories: 0  (cols: dir hits)\ntotal_results: 0\nhas_more: false\n';
  const transport = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    return backendText(call.tool === 'search_graph' ? emptyResults : emptyCode);
  });
  const envelope = await repoSearchDiscover(
    {
      allowedRoots: ['/repo'],
      executor: executorFor('/repo/needle.ts:2:needle here'),
      query: 'needle',
      root: '/repo',
      transport,
    },
    async () => gateReceipt(false),
  );
  expect(envelope).toMatchObject({ found: true, source: 'fallback', status: 'found' });
  expect(envelope.attempts.map((attempt) => attempt.strategy)).toEqual([
    'resolve-index',
    'index-status',
    'search-graph',
    'search-code',
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-files',
    'binary-gate:classify',
  ]);
});

test('read routes explicit URL targets through the running-app-free website row', async () => {
  const executor = executorFor('<html>page body</html>');
  const envelope = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor,
    queries: [],
    readFile: mock(async () => ''),
    root: '/repo',
    target: 'https://example.com',
    transport: null,
  });
  expect(envelope).toMatchObject({ found: true, source: 'binary', status: 'found' });
  expect(envelope.results[0]).toMatchObject({ detail: '<html>page body</html>', kind: 'binary' });
});

test('read reports symbol errors for a failed project list and a missing index', async () => {
  const failing = fakeTransport(() => new Error('backend exploded'));
  const listed = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    queries: [],
    readFile: mock(async () => ''),
    root: '/repo',
    target: 'repo.src.needle',
    transport: failing,
  });
  expect(listed).toMatchObject({ ok: false, status: 'error' });
  expect(listed.reliability.caveats).toContain('Backend project list unavailable.');
  const empty = fakeTransport(
    toolsTable('list_projects', 'projects: 0  (cols: name root_path branch)\ntotal: 0'),
  );
  const unmatched = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    queries: [],
    readFile: mock(async () => ''),
    root: '/repo',
    target: 'repo.src.needle',
    transport: empty,
  });
  expect(unmatched).toMatchObject({ ok: false, status: 'error' });
  expect(unmatched.next).toEqual([
    'search <approved-root> repo.src.needle to locate the symbol first.',
  ]);
  await expect(
    repoSearchRead({
      allowedRoots: ['/repo'],
      executor: executorFor(''),
      queries: [],
      readFile: mock(async () => ''),
      root: '/repo',
      target: '   ',
      transport: null,
    }),
  ).rejects.toThrow('Read target is required');
});

test('parsers skip malformed rows instead of trusting partial tokens', () => {
  expect(parseListProjects('projects: 1  (cols: name root_path branch)\n  ""\ntotal: 0')).toEqual(
    [],
  );
  expect(parseSearchGraph('results: 1  (cols: qn label file lines rank)\n  a b\n')).toEqual({
    hasMore: false,
    rows: [],
  });
  expect(parseSearchCode('directories: 1  (cols: dir hits)\n  src/\n')).toEqual({
    directories: [],
    hasMore: false,
    rows: [],
  });
});

test('search suggests restoring the transport only when nothing was found', async () => {
  const envelope = await repoSearchDiscover(
    {
      allowedRoots: ['/repo'],
      executor: executorFor('', 1),
      query: 'needle',
      root: '/repo',
      transport: null,
    },
    async () => gateReceipt(false),
  );
  expect(envelope).toMatchObject({ found: false, status: 'empty' });
  expect(envelope.next).toEqual(['Restore the backend transport for indexed discovery.']);
});

test('read reports indexing failure and a failed readiness re-check', async () => {
  const failingIndex: typeof projectsTable = projectsTable;
  const indexer = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(failingIndex);
    }
    if (call.tool === 'index_status') {
      return backendText(notReadyStatus);
    }
    if (call.tool === 'index_repository') {
      return backendError('indexing denied');
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const failed = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    queries: [],
    readFile: mock(async () => ''),
    root: '/repo',
    target: 'repo.src.needle',
    transport: indexer,
  });
  expect(failed).toMatchObject({ ok: false, status: 'error' });
  expect(failed.reliability.caveats.join(' ')).toContain('indexing denied');
  const rechecking = fakeTransport((call) => {
    if (call.tool === 'list_projects') {
      return backendText(projectsTable);
    }
    if (call.tool === 'index_status') {
      return backendText(notReadyStatus);
    }
    if (call.tool === 'index_repository') {
      return backendText('indexed');
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const rechecked = await repoSearchRead({
    allowedRoots: ['/repo'],
    executor: executorFor(''),
    queries: [],
    readFile: mock(async () => ''),
    root: '/repo',
    target: 'repo.src.needle',
    transport: rechecking,
  });
  expect(rechecked).toMatchObject({ ok: false, status: 'error' });
  expect(rechecked.reliability.caveats).toContain(
    'Index not ready after indexing and the readiness re-check.',
  );
});
