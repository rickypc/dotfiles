import { expect, mock, test } from 'bun:test';

import {
  commandFor,
  run,
  runWhenMain,
  usage,
} from '../../scripts/codebase-memory.js';

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
] as const)('renders %s through the CBM CLI only', async (args, operation) => {
  expect(commandFor(args).args).toContain(operation);
  const write = mock();
  await run(args, write);
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('CBM_LOG_LEVEL=error codebase-memory-mcp cli'),
  );
});

test('runs discovery through the shared CBM fallback boundary', async () => {
  const write = mock();
  const search = mock(async () => ({
    attempts: [],
    found: false,
    output: '',
    source: 'none' as const,
  }));
  await run(['discover', '/repo', 'repo', 'needle'], write, search);
  expect(search).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ query: 'needle' }),
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"source"'));
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
    ['inspect', '/repo', '/os-temp/aidlc-cbm/request.jsonl'],
    write,
    undefined,
    read,
    resolve,
    inspect,
    '/os-temp',
  );
  expect(resolve).toHaveBeenCalledWith('/repo', expect.anything());
  expect(read).toHaveBeenCalledWith('/os-temp/aidlc-cbm/request.jsonl');
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

test('rejects invalid CBM command shapes and guards the main boundary', async () => {
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
