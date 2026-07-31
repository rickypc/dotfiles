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
