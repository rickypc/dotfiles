import { expect, mock, test } from 'bun:test';

import {
  inspectRepoSearch,
  parseRepoSearchInspectionJsonl,
  type RepoSearchInspectionOperation,
  repoSearchInspectionCall,
} from '../../utils/repo-search-inspection.js';
import type {
  RepoSearchBackendCall,
  RepoSearchBackendResult,
  RepoSearchTransport,
} from '../../utils/repo-search-transport.js';
import type { SearchAttempt } from '../../utils/search-fallback.js';

const projectsTable = [
  'projects: 1  (cols: name root_path branch)',
  '  repo /repo main',
  'total: 1',
  '',
].join('\n');

const readyStatus = ['project: repo', 'status: ready', 'indexed_at: 2026-09-25T08:22:24Z', ''].join(
  '\n',
);

const notReadyStatus = 'project: repo\nstatus: not ready\n';

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

const fakeTransport = (
  handler: (call: RepoSearchBackendCall) => RepoSearchBackendResult,
): RepoSearchTransport => ({
  call: mock(async (call: RepoSearchBackendCall) => handler(call)),
  close: mock(async () => undefined),
  kind: 'mcp',
});

const probeAttempt: SearchAttempt = {
  command: 'codebase-memory-mcp (stdio MCP)',
  detail: 'MCP stdio transport is primary and available (list_projects answered).',
  status: 'found',
  strategy: 'transport-probe',
};

test('parses and maps every declared inspection operation', () => {
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
    operations.map(
      (operation: RepoSearchInspectionOperation) =>
        repoSearchInspectionCall('repo', operation).tool,
    ),
  ).toEqual([
    'get_architecture',
    'get_graph_schema',
    'search_graph',
    'get_code_snippet',
    'trace_path',
    'search_code',
  ]);
  expect(repoSearchInspectionCall('repo', { operation: 'schema' }).args).toEqual({
    project: 'repo',
  });
  expect(() => parseRepoSearchInspectionJsonl('')).toThrow('at least one JSONL');
  expect(() => parseRepoSearchInspectionJsonl('{"operation":"unknown"}')).toThrow('Unsupported');
  expect(() =>
    parseRepoSearchInspectionJsonl(
      '{"operation":"trace","qualifiedName":"a","direction":"both","depth":1}',
    ),
  ).toThrow('direction');
  expect(() =>
    parseRepoSearchInspectionJsonl('{"operation":"search-code","pattern":"x","limit":0}'),
  ).toThrow('positive integer');
  expect(() => parseRepoSearchInspectionJsonl('not-json')).toThrow('line 1');
});

test('inspect checks readiness once and returns one receipt per declared read', async () => {
  const transport = fakeTransport((call) => {
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    if (call.tool === 'get_graph_schema') {
      return backendText('schema body');
    }
    if (call.tool === 'get_architecture') {
      return backendError('no architecture');
    }
    return backendError(`unexpected tool: ${call.tool}`);
  });
  const envelope = await inspectRepoSearch(
    transport,
    { index: 'repo', root: '/repo' },
    [{ operation: 'architecture', path: '' }, { operation: 'schema' }],
    probeAttempt,
  );
  expect(envelope).toMatchObject({ found: true, ok: true, status: 'found', verb: 'inspect' });
  expect(envelope.results.map((result) => result.name)).toEqual(['architecture(all)', 'schema']);
  expect(envelope.results[0]).toMatchObject({ detail: 'no architecture' });
  expect(envelope.results[1]).toMatchObject({ detail: 'schema body' });
  expect(envelope.attempts.map((attempt) => attempt.strategy)).toEqual([
    'transport-probe',
    'index-status',
    'inspect:architecture',
    'inspect:schema',
  ]);
});

test('inspect stops before the declared reads when the index is not ready', async () => {
  const transport = fakeTransport((call) =>
    call.tool === 'index_status' ? backendText(notReadyStatus) : backendError('unexpected'),
  );
  const envelope = await inspectRepoSearch(transport, { index: 'repo', root: '/repo' }, [
    { operation: 'schema' },
  ]);
  expect(envelope).toMatchObject({ ok: false, status: 'error' });
  expect(envelope.results).toEqual([]);
  expect(transport.call).toHaveBeenCalledTimes(1);
  const noTransport = await inspectRepoSearch(null, { index: 'repo', root: '/repo' }, [
    { operation: 'schema' },
  ]);
  expect(noTransport).toMatchObject({ ok: false, status: 'error', transport: 'none' });
});

test('inspection parsing rejects malformed operations and labels every op', async () => {
  expect(() => parseRepoSearchInspectionJsonl('{"operation":"architecture"}')).toThrow(
    'architecture path must be a string.',
  );
  expect(() => parseRepoSearchInspectionJsonl('{"operation":"snippet"}')).toThrow(
    'non-empty string',
  );
  expect(() => parseRepoSearchInspectionJsonl('[]')).toThrow('must be an object');
  const transport = fakeTransport((call) => {
    if (call.tool === 'index_status') {
      return backendText(readyStatus);
    }
    return backendText('body');
  });
  const envelope = await inspectRepoSearch(transport, { index: 'repo', root: '/repo' }, [
    {
      label: 'Function',
      limit: 5,
      namePattern: '.*needle.*',
      operation: 'search-graph',
    },
    { depth: 2, direction: 'inbound', operation: 'trace', qualifiedName: 'repo.a' },
    { limit: 5, operation: 'search-code', pattern: 'needle' },
    { operation: 'snippet', qualifiedName: 'repo.a' },
    { operation: 'architecture', path: 'src' },
  ]);
  expect(envelope.results.map((result) => result.name)).toEqual([
    'search-graph(.*needle.*, Function)',
    'trace(repo.a, inbound, 2)',
    'search-code(needle)',
    'snippet(repo.a)',
    'architecture(src)',
  ]);
  expect(parseRepoSearchInspectionJsonl('{"operation":"schema"}')).toEqual([
    { operation: 'schema' },
  ]);
  expect(projectsTable).toContain('repo /repo main');
});
