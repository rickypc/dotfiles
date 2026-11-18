import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import * as realFsPromises from 'node:fs/promises';
import * as realOs from 'node:os';
import path from 'node:path';
import realTls from 'node:tls';
import type {
  ChatMessage,
  ModelHandle,
  ReaderDependencies,
} from '../../../scripts/weak-reader/index.js';

mock.module('node:fs/promises', () => realFsPromises);
mock.module('node:os', () => realOs);
mock.module('node:path', () => ({ default: path }));
mock.module('node:tls', () => ({ ...realTls, default: realTls }));
mock.module('webgpu', () => ({
  create: mock(() => ({ requestAdapter: mock(async () => ({})) })),
  globals: { GPUBufferUsage: 'usage' },
}));
mock.module('./weak-reader-batch.js', () => import('../../../scripts/weak-reader/batch.js'));

const { EXIT_CODES, MODEL_REVISION, SUGGEST_MAX_NEW_TOKENS, VENDORED_BUNDLE_SHA256, run } =
  await import('../../../scripts/weak-reader/index.js');

const original = { error: console.error, exit: process.exit, log: console.log };
const consoleError = mock();
const consoleLog = mock();
const processExit = mock();

beforeEach(() => {
  console.error = consoleError;
  console.log = consoleLog;
  process.exit = processExit as unknown as typeof process.exit;
});

afterEach(() => {
  console.error = original.error;
  console.log = original.log;
  process.exit = original.exit;
  consoleError.mockClear();
  consoleLog.mockClear();
  processExit.mockClear();
});

const bundle = (document: string): string =>
  JSON.stringify({
    document,
    instructions: 'Answer.',
    prompts: [{ query: 'Q1?', query_id: 'q1', run: 1 }],
  });

const modelOf = (encoded = 3): ModelHandle => ({
  dispose: mock(),
  encodePrompt: () => new Array(encoded).fill(1),
  generate: (_messages: readonly ChatMessage[], options: { maxNewTokens: number }) =>
    (async function* () {
      yield { text: options.maxNewTokens === SUGGEST_MAX_NEW_TOKENS ? ' Why. ' : 'B' };
    })(),
  warmup: mock(async () => undefined),
});

const setup = (model: ModelHandle, files: Record<string, string>) => {
  const writes = new Map<string, string>();
  const plan = JSON.stringify({ files: [], id: 'm', sha: MODEL_REVISION });
  const deps: ReaderDependencies = {
    assignGlobals: mock(),
    env: { HF_HOME: '/cache' },
    exists: mock(async (target: string) => target.endsWith('weak-reader-plan.json')),
    fetch: mock(async () => new Response('')),
    hashFile: mock(async () => ''),
    hashText: mock(() => VENDORED_BUNDLE_SHA256),
    home: '/home',
    importSource: mock(async () => ({ Gemma4Mobile: { load: mock(async () => model) } })),
    importWebgpu: mock(async () => ({
      create: () => ({ requestAdapter: async () => ({}) }),
      globals: {},
    })),
    installNavigatorGpu: mock(),
    log: mock(),
    mkdir: mock(async () => undefined),
    now: mock(() => 0),
    openLocalFile: mock(async () => undefined),
    readText: mock(async (target: string) =>
      target.endsWith('weak-reader-plan.json') ? plan : (files[target] ?? ''),
    ),
    readVendoredBundle: mock(async () => 'vendored'),
    rename: mock(async () => undefined),
    symlink: mock(async () => undefined),
    writeBody: mock(async () => undefined),
    writeText: mock(async (target: string, content: string) => {
      writes.set(target, content);
    }),
  };
  return { deps, writes };
};

const batch = JSON.stringify({
  items: [
    {
      answersPath: '/o/a',
      bundlePath: '/in/a.json',
      expected: { q1: 'A' },
      suggestionsPath: '/o/s',
    },
  ],
});

test('run dispatches batch through the reader hooks and writes answers and suggestions', async () => {
  const model = modelOf();
  const { deps, writes } = setup(model, { '/in/a.json': bundle('doc'), '/in/batch.json': batch });
  expect(await run(['batch', '/in/batch.json'], deps)).toBe(EXIT_CODES.answered);
  expect(writes.get('/o/a')).toBe('{"answer":"B","query_id":"q1","run":1}\n');
  expect(writes.get('/o/s')).toBe('{"id":"q1","suggestion":"Why."}\n');
  expect(model.dispose).toHaveBeenCalledTimes(1);
  expect(consoleError).not.toHaveBeenCalled();
  expect(consoleLog).not.toHaveBeenCalled();
  expect(processExit).not.toHaveBeenCalled();
});

test('run batch reports a document over the context capacity and invalid input', async () => {
  const { deps } = setup(modelOf(9000), { '/in/a.json': bundle('doc'), '/in/batch.json': batch });
  await expect(run(['batch', '/in/batch.json'], deps)).rejects.toMatchObject({
    exitCode: EXIT_CODES.tooLong,
  });
  await expect(run(['batch'], deps)).rejects.toMatchObject({
    exitCode: EXIT_CODES.failure,
    message: expect.stringContaining('weak-reader/index.ts batch <absolute-batch-json-path>'),
  });
});
