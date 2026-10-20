import { afterEach, expect, mock, test } from 'bun:test';

import { parseRepoSearchArgs, run, runWhenMain, usage } from '../../scripts/repo-search.js';
import type { CommandExecutor } from '../../utils/process.js';
import type { RepoSearchTransport } from '../../utils/repo-search-transport.js';

afterEach(() => {
  process.exitCode = undefined;
});

const probeFor = (transport: RepoSearchTransport | null) =>
  mock(async () => ({
    attempt: {
      command: 'probe',
      detail: transport ? 'available' : 'unavailable',
      status: 'found',
      strategy: 'transport-probe',
    } as const,
    transport,
  }));

const executor: CommandExecutor = mock(async () => ({ code: 0, stderr: '', stdout: '' }));

test('parses the three-verb grammar and the bare search alias', () => {
  expect(parseRepoSearchArgs(['/repo', 'how', 'does', 'x', 'work'])).toEqual({
    queries: ['how does x work'],
    root: '/repo',
    verb: 'search',
  });
  expect(parseRepoSearchArgs(['search', '/repo', 'needle'])).toEqual({
    queries: ['needle'],
    root: '/repo',
    verb: 'search',
  });
  expect(parseRepoSearchArgs(['read', '/repo', '/repo/file.ts', 'extra'])).toEqual({
    queries: ['extra'],
    root: '/repo',
    target: '/repo/file.ts',
    verb: 'read',
  });
  expect(parseRepoSearchArgs(['inspect', '/repo', '/os-temp/request.jsonl'])).toEqual({
    queries: [],
    requestPath: '/os-temp/request.jsonl',
    root: '/repo',
    verb: 'inspect',
  });
});

test('rejects malformed invocations with the usage contract', () => {
  for (const args of [
    [],
    ['repo'],
    ['search', '/repo'],
    ['read', '/repo'],
    ['inspect', '/repo'],
    ['inspect', '/repo', '/os-temp/a.jsonl', 'extra'],
  ] as const) {
    expect(() => parseRepoSearchArgs([...args])).toThrow(usage());
  }
});

test('runs a search through the wrapper and prints the envelope', async () => {
  const write = mock();
  const executorCalls = mock(async () => ({
    code: 0,
    stderr: '',
    stdout: '/repo/needle.ts:4:needle found',
  })) as unknown as CommandExecutor;
  await run(['/repo', 'needle'], write, mock(), '/os-temp', probeFor(null), executorCalls);
  const printed = JSON.parse(String(write.mock.calls[0]?.[0])) as {
    status: string;
    source: string;
  };
  expect(printed.status).toBe('found');
  expect(printed.source).toBe('fallback');
  expect(process.exitCode).toBeUndefined();
});

test('sets the exit code only for error envelopes', async () => {
  const write = mock();
  await run(
    ['read', '/repo', '/outside/file.ts'],
    write,
    mock(),
    '/os-temp',
    probeFor(null),
    executor,
  );
  const printed = JSON.parse(String(write.mock.calls[0]?.[0])) as { ok: boolean; status: string };
  expect(printed.ok).toBeFalse();
  expect(printed.status).toBe('error');
  expect(process.exitCode).toBe(1);
});

test('runs an inspection from an OS-temporary JSONL request', async () => {
  const write = mock();
  const read = mock(async () => '{"operation":"schema"}');
  const calls: string[] = [];
  const transport: RepoSearchTransport = {
    call: mock(async (call: { tool: string }) => {
      calls.push(call.tool);
      if (call.tool === 'list_projects') {
        return {
          error: null,
          isError: false,
          text: 'projects: 1  (cols: name root_path branch)\n  repo /repo main\ntotal: 1',
        };
      }
      if (call.tool === 'index_status') {
        return {
          error: null,
          isError: false,
          text: 'status: ready\nindexed_at: 2026-09-25T08:22:24Z',
        };
      }
      return { error: null, isError: false, text: 'schema body' };
    }),
    close: mock(async () => undefined),
    kind: 'mcp',
  };
  await run(
    ['inspect', '/repo', '/os-temp/request.jsonl'],
    write,
    read,
    '/os-temp',
    probeFor(transport),
    executor,
  );
  expect(read).toHaveBeenCalledWith('/os-temp/request.jsonl');
  expect(calls).toEqual(['list_projects', 'index_status', 'get_graph_schema']);
  const printed = JSON.parse(String(write.mock.calls[0]?.[0])) as {
    results: readonly { detail: string }[];
    verb: string;
  };
  expect(printed.verb).toBe('inspect');
  expect(printed.results[0]?.detail).toBe('schema body');
});

test('rejects an inspection request outside the OS temporary directory', async () => {
  const write = mock();
  const transport: RepoSearchTransport = {
    call: mock(async () => ({ error: null, isError: false, text: 'unused' })),
    close: mock(async () => undefined),
    kind: 'mcp',
  };
  await run(
    ['inspect', '/repo', '/project/request.jsonl'],
    write,
    mock(),
    '/os-temp',
    probeFor(transport),
    executor,
  );
  const printed = JSON.parse(String(write.mock.calls[0]?.[0])) as { status: string };
  expect(printed.status).toBe('error');
  expect(write.mock.calls[0]?.[0]).toContain('OS temporary directory');
  expect(process.exitCode).toBe(1);
});

test('guards the main boundary and help route', () => {
  const runner = mock();
  void runWhenMain(true, ['/repo', 'needle'], runner);
  void runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});

test('rejects an inspection when no transport is available', async () => {
  const write = mock();
  await run(
    ['inspect', '/repo', '/os-temp/request.jsonl'],
    write,
    mock(),
    '/os-temp',
    probeFor(null),
    executor,
  );
  const printed = JSON.parse(String(write.mock.calls[0]?.[0])) as { status: string };
  expect(printed.status).toBe('error');
  expect(write.mock.calls[0]?.[0]).toContain('Inspection reads require a backend transport.');
  expect(process.exitCode).toBe(1);
});

test('rejects an inspection when no project index matches the root', async () => {
  const write = mock();
  const transport: RepoSearchTransport = {
    call: mock(async () => ({
      error: null,
      isError: false,
      text: 'projects: 1  (cols: name root_path branch)\n  other /other main\ntotal: 1',
    })),
    close: mock(async () => undefined),
    kind: 'cli',
  };
  await run(
    ['inspect', '/repo', '/os-temp/request.jsonl'],
    write,
    mock(async () => '{"operation":"schema"}'),
    '/os-temp',
    probeFor(transport),
    executor,
  );
  const printed = JSON.parse(String(write.mock.calls[0]?.[0])) as { status: string };
  expect(printed.status).toBe('error');
  expect(write.mock.calls[0]?.[0]).toContain('No matching project index');
  expect(process.exitCode).toBe(1);
});
