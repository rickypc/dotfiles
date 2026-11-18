import { expect, mock, test } from 'bun:test';
import * as realPath from 'node:path';
import type {
  ModelHandle,
  ReaderBundle,
  ReaderDependencies,
  ReaderFailure,
} from '../../scripts/weak-reader.js';
import * as realReader from '../../scripts/weak-reader.js';

// Real implementations are registered so no divergent double leaks into other same-process files.
mock.module('node:path', () => realPath);
mock.module('./weak-reader.js', () => realReader);

const { parseBatchManifest, runBatch } = await import('../../scripts/weak-reader-batch.js');
type Hooks = Parameters<typeof runBatch>[2];

const bundleOf = (document: string): ReaderBundle => ({
  document,
  instructions: 'Answer.',
  prompts: [
    { query: 'Q1?', query_id: 'q1', run: 1 },
    { query: 'Q2?', query_id: 'q2', run: 1 },
  ],
});

const failWith = (message: string): Error => new Error(`fail: ${message}`);

const manifest = (items: unknown[]): string => JSON.stringify({ items });

const modelOf = (): ModelHandle => ({
  dispose: mock(),
  encodePrompt: () => [],
  generate: () => (async function* () {})(),
  warmup: mock(async () => undefined),
});

const setup = (files: Record<string, string>, models: ModelHandle[]) => {
  const writes = new Map<string, string>();
  const logs: string[] = [];
  const deps: ReaderDependencies = {
    assignGlobals: mock(),
    env: {},
    exists: mock(async () => false),
    fetch: mock(async () => new Response('')),
    hashFile: mock(async () => ''),
    hashText: mock(() => ''),
    home: '/home',
    importSource: mock(async () => ({ Gemma4Mobile: { load: mock() } })),
    importWebgpu: mock(async () => ({ create: mock(), globals: {} })),
    installNavigatorGpu: mock(),
    log: (message: string) => {
      logs.push(message);
    },
    mkdir: mock(async () => undefined),
    now: mock(() => 0),
    openLocalFile: mock(async () => undefined),
    readText: mock(async (target: string) => files[target] ?? ''),
    readVendoredBundle: mock(async () => ''),
    rename: mock(async () => undefined),
    symlink: mock(async () => undefined),
    writeBody: mock(async () => undefined),
    writeText: mock(async (target: string, content: string) => {
      writes.set(target, content);
    }),
  };
  const prepare = mock(async (_bundle: ReaderBundle) => models.shift() as ModelHandle);
  const suggest = mock(
    async (_model: ModelHandle, _bundle: ReaderBundle, failure: ReaderFailure) =>
      `fix ${failure.id}`,
  );
  const hooks: Hooks = {
    answerAll: async (_model, bundle) => ({
      lines: bundle.prompts.map(({ query_id: id }) =>
        id === 'q1'
          ? JSON.stringify({ answer: 'B', query_id: id })
          : JSON.stringify({ query_id: id, skill_name: 'alpha' }),
      ),
      rawLines: bundle.prompts.map(({ query_id: id }) =>
        JSON.stringify({ query_id: id, raw_reply: `raw ${id}` }),
      ),
    }),
    fail: failWith,
    parseBundle: (content) => bundleOf(content),
    prepare,
    suggest,
    usage: () => 'USAGE',
  };
  return { deps, hooks, logs, prepare, suggest, writes };
};

test('answers bundles of equal capacity in one model session with optional outputs', async () => {
  const model = modelOf();
  const second = modelOf();
  const { deps, hooks, logs, prepare, suggest, writes } = setup(
    {
      '/in/a.json': 'doc a',
      '/in/b.json': 'doc b',
      '/in/batch.json': manifest([
        {
          answersPath: '/o/a1',
          bundlePath: '/in/a.json',
          expected: { missing: 'A', q1: 'A', q2: 'beta' },
          rawRepliesPath: '/o/r1',
          suggestionsPath: '/o/s1',
        },
        { answersPath: '/o/a2', bundlePath: '/in/b.json' },
      ]),
    },
    [model, second],
  );
  await runBatch(['/in/batch.json'], deps, hooks);
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(model.warmup).toHaveBeenCalledTimes(1);
  expect(model.dispose).toHaveBeenCalledTimes(1);
  expect(second.dispose).toHaveBeenCalledTimes(1);
  expect(writes.get('/o/a1')).toBe(
    '{"answer":"B","query_id":"q1"}\n{"query_id":"q2","skill_name":"alpha"}\n',
  );
  expect(writes.get('/o/a2')).toBe(writes.get('/o/a1'));
  expect(writes.get('/o/r1')).toBe(
    '{"query_id":"q1","raw_reply":"raw q1"}\n{"query_id":"q2","raw_reply":"raw q2"}\n',
  );
  expect(suggest.mock.calls.map((call) => call[2])).toEqual([
    { expected: 'A', given: 'B', id: 'q1', query: 'Q1?', rawReply: 'raw q1' },
    { expected: 'beta', given: 'alpha', id: 'q2', query: 'Q2?', rawReply: 'raw q2' },
  ]);
  expect(writes.get('/o/s1')).toBe(
    '{"id":"q1","suggestion":"fix q1"}\n{"id":"q2","suggestion":"fix q2"}\n',
  );
  expect(writes.has('/o/r2')).toBe(false);
  expect(logs).toEqual([
    'GPU ready; answered 2 probes for /in/a.json',
    'GPU ready; answered 2 probes for /in/b.json',
  ]);
});

test('writes empty suggestions when nothing failed and uses an empty expected map by default', async () => {
  const { deps, hooks, suggest, writes } = setup(
    {
      '/in/a.json': 'doc a',
      '/in/batch.json': manifest([
        { answersPath: '/o/a', bundlePath: '/in/a.json', suggestionsPath: '/o/s' },
        {
          answersPath: '/o/b',
          bundlePath: '/in/a.json',
          expected: { q1: 'B' },
          suggestionsPath: '/o/t',
        },
      ]),
    },
    [modelOf(), modelOf()],
  );
  await runBatch(['/in/batch.json'], deps, hooks);
  expect(suggest).not.toHaveBeenCalled();
  expect(writes.get('/o/s')).toBe('');
  expect(writes.get('/o/t')).toBe('');
});

test('releases the model of a failing document and stops the batch', async () => {
  const first = modelOf();
  const failing = modelOf();
  const { deps, hooks, writes } = setup(
    {
      '/in/a.json': 'doc a',
      '/in/b.json': 'doc b',
      '/in/batch.json': manifest([
        { answersPath: '/o/a', bundlePath: '/in/a.json' },
        { answersPath: '/o/b', bundlePath: '/in/b.json' },
        { answersPath: '/o/c', bundlePath: '/in/c.json' },
      ]),
      '/in/c.json': 'doc c',
    },
    [first, failing],
  );
  let calls = 0;
  const failOnSecond: typeof hooks.answerAll = async (model, bundle, readerDeps) => {
    calls += 1;
    if (calls === 2) {
      throw new Error('reader failed');
    }
    return hooks.answerAll(model, bundle, readerDeps);
  };
  await expect(
    runBatch(['/in/batch.json'], deps, { ...hooks, answerAll: failOnSecond }),
  ).rejects.toThrow('reader failed');
  expect(writes.has('/o/a')).toBe(true);
  expect(writes.has('/o/b')).toBe(false);
  expect(writes.has('/o/c')).toBe(false);
  expect(first.dispose).toHaveBeenCalledTimes(1);
  expect(failing.dispose).toHaveBeenCalledTimes(1);
});

test.each([
  ['invalid JSON', 'not json'],
  ['no items array', '{}'],
  ['no items', manifest([])],
  ['a null item', manifest([null])],
  ['a relative path', manifest([{ answersPath: 'a', bundlePath: '/in/a.json' }])],
  [
    'a relative optional path',
    manifest([{ answersPath: '/o/a', bundlePath: '/i', rawRepliesPath: 'r' }]),
  ],
  [
    'a non-string optional path',
    manifest([{ answersPath: '/o/a', bundlePath: '/i', suggestionsPath: 3 }]),
  ],
  [
    'a non-object expected map',
    manifest([{ answersPath: '/o/a', bundlePath: '/i', expected: 'A' }]),
  ],
  ['a null expected map', manifest([{ answersPath: '/o/a', bundlePath: '/i', expected: null }])],
])('parseBatchManifest rejects %s', (_name, content) => {
  expect(() => parseBatchManifest(content, '/in/batch.json', failWith)).toThrow(
    'fail: /in/batch.json',
  );
});

test('parseBatchManifest accepts a complete manifest', () => {
  const item = {
    answersPath: '/o/a',
    bundlePath: '/in/a.json',
    expected: { q1: 'A' },
    rawRepliesPath: '/o/r',
    suggestionsPath: '/o/s',
  };
  expect(parseBatchManifest(manifest([item]), '/in/batch.json', failWith)).toEqual([item]);
});

test.each([[[]], [['relative.json']], [['/a.json', '/b.json']]])(
  'runBatch rejects arguments %j with the usage text',
  async (args) => {
    const { deps, hooks } = setup({}, [modelOf()]);
    await expect(runBatch(args, deps, hooks)).rejects.toThrow('fail: USAGE');
  },
);
