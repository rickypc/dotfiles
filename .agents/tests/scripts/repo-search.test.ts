import { afterEach, expect, mock, test } from 'bun:test';

import { command, createCommand } from '../../scripts/repo-search.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';
import type { CommandExecutor } from '../../utils/process.js';
import type { RepoSearchTransport } from '../../utils/repo-search/transport.js';

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

const execute = async (
  args: readonly string[],
  overrides: Parameters<typeof createCommand>[0] = {},
) => {
  const out: string[] = [];
  const err: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => err.push(message),
  };
  const code = await runCommand(createCommand(overrides), args, context);
  return { code, err, out };
};

const requestOf = async (args: readonly string[]) => {
  const { out } = await execute([...args, '--verbose'], {
    executor,
    probe: probeFor(null),
    read: mock(),
    temporaryDirectory: '/os-temp',
  });
  return JSON.parse(out[0] ?? '{}').data ?? JSON.parse(out[0] ?? '{}').data;
};

const run = async (
  args: readonly string[],
  write: (message: string) => void,
  read: (path: string) => Promise<string | Buffer>,
  temporaryDirectory: string,
  probe: Parameters<typeof createCommand>[0] extends infer T
    ? NonNullable<T extends { probe?: infer P } ? P : never>
    : never,
  runner: CommandExecutor,
): Promise<void> => {
  const { code, out } = await execute([...args], {
    executor: runner,
    probe,
    read,
    temporaryDirectory,
  });
  write(JSON.stringify(JSON.parse(out[0] ?? '{}').data, null, 2));
  if (code !== 0) {
    process.exitCode = code;
  }
};

test('parses the three-verb grammar and the bare search alias', async () => {
  expect((await requestOf(['/repo', 'how', 'does', 'x', 'work'])).query).toMatchObject({
    input: ['how does x work'],
    root: '/repo',
  });
  expect((await requestOf(['search', '/repo', 'needle'])).query).toMatchObject({
    input: ['needle'],
  });
  expect((await requestOf(['/repo', 'needle', '--raw'])).query).toMatchObject({
    input: ['needle'],
  });
  expect((await requestOf(['read', '/repo', '/repo/file.ts', 'extra'])).verb).toBe('read');
  expect((await requestOf(['inspect', '/repo', '/os-temp/request.jsonl'])).verb).toBe('inspect');
});

test('rejects malformed invocations with usage exit 2', async () => {
  for (const args of [
    [],
    ['repo'],
    ['search', '/repo'],
    ['read', '/repo'],
    ['inspect', '/repo'],
    ['inspect', '/repo', '/os-temp/a.jsonl', 'extra'],
    ['read', '/repo', ' '],
    ['search', 'relative', 'needle'],
    ['/repo', ' '],
  ] as const) {
    expect((await execute([...args])).code).toBe(2);
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

test('answers --help with the three verbs and the omittable search name', async () => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  expect(await runCommand(command, ['--help'], context)).toBe(0);
  expect(out[0]).toContain('inspect');
  expect(out[0]).toContain('may be omitted');
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

test('the default output condenses attempts and --verbose restores commands', async () => {
  const transport: RepoSearchTransport = {
    call: mock(async () => ({
      error: null,
      isError: false,
      text: 'projects: 1  (cols: name root_path branch)\n  other /other main\ntotal: 1',
    })),
    close: mock(async () => undefined),
    kind: 'mcp',
  };
  const searchExecutor = mock(async () => ({
    code: 0,
    stderr: '',
    stdout: '/repo/needle.ts:4:needle found',
  })) as unknown as CommandExecutor;
  const condensedWrite = mock();
  await run(
    ['/repo', 'needle'],
    condensedWrite,
    mock(),
    '/os-temp',
    probeFor(transport),
    searchExecutor,
  );
  const condensed = JSON.parse(String(condensedWrite.mock.calls[0]?.[0])) as {
    attempts: Readonly<Record<string, unknown>>[];
  };
  expect(condensed.attempts.length).toBeGreaterThan(0);
  for (const attempt of condensed.attempts) {
    expect(Object.keys(attempt).sort()).toEqual(['status', 'strategy']);
  }
  const verboseWrite = mock();
  await run(
    ['/repo', 'needle', '--verbose'],
    verboseWrite,
    mock(),
    '/os-temp',
    probeFor(transport),
    searchExecutor,
  );
  const verbose = JSON.parse(String(verboseWrite.mock.calls[0]?.[0])) as {
    attempts: Readonly<Record<string, unknown>>[];
  };
  expect(verbose.attempts.some((attempt) => typeof attempt.command === 'string')).toBeTrue();
  expect(verbose.attempts.some((attempt) => typeof attempt.detail === 'string')).toBeTrue();
});

test('prints the condensed envelope as indented JSON with --format text', async () => {
  const { out } = await execute(['/repo', 'needle', '--format', 'text'], {
    executor,
    probe: probeFor(null),
    read: mock(),
    temporaryDirectory: '/os-temp',
  });
  expect(JSON.parse(out[0] ?? '').status).toBeDefined();
});
