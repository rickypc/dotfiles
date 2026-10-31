import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

import {
  BENCH_COLUMNS,
  benchmarkModel,
  chunkDelta,
  cliBoundaries,
  consumeChunk,
  consumeLines,
  errorDetail,
  errorMessageFrom,
  failureFor,
  finalizeStream,
  type ModelCheckBoundaries,
  type ModelCheckEnv,
  missingConfigFrom,
  modelsFrom,
  parsedMessage,
  payloadFor,
  pendingResultFor,
  processExitCode,
  promptFrom,
  readDrain,
  readEnv,
  readLog,
  recordChunk,
  run,
  runBenchmark,
  runCli,
  splitList,
  thinkingModelsFrom,
  uniqueList,
  usage,
} from '../../scripts/model-check.js';

const ENV: ModelCheckEnv = {
  API_KEY: 'test-key',
  API_URL: 'https://example.invalid/v1/chat/completions',
  MODELS: 'model-a,model-b',
  PROMPT: 'Say hi.',
  THINKING_MODELS: 'model-b',
};

const NO_ENV: ModelCheckEnv = {};

let clock = 0;
const boundaries = (
  overrides: Partial<ModelCheckBoundaries> = {},
): {
  readonly boundaries: ModelCheckBoundaries;
  readonly log: ReturnType<typeof mock>;
  readonly error: ReturnType<typeof mock>;
  readonly exit: ReturnType<typeof mock>;
  readonly table: ReturnType<typeof mock>;
  readonly clearTimeout: ReturnType<typeof mock>;
  readonly setTimeout: ReturnType<typeof mock>;
  readonly fetch: ReturnType<typeof mock>;
} => {
  const log = mock((_message: string) => undefined);
  const error = mock((_message: string) => undefined);
  const exit = mock((_code: number) => undefined);
  const table = mock((_rows: readonly unknown[]) => undefined);
  const clearTimeout = mock((_timer: unknown) => undefined);
  const setTimeout = mock((_handler: () => void, _ms: number) => 1 as never);
  const made: ModelCheckBoundaries = {
    clearTimeout,
    error,
    exit,
    fetch: mock((_url: string, _init: RequestInit) =>
      Promise.resolve(new Response('unused', { status: 200 })),
    ),
    log,
    now,
    random: () => 0,
    setTimeout,
    table,
    ...overrides,
  };
  return {
    boundaries: made,
    clearTimeout,
    error,
    exit,
    fetch: made.fetch as ReturnType<typeof mock>,
    log,
    setTimeout,
    table,
  };
};

const constantNow = (): number => 7;

const now = (): number => (clock += 10);

const readerFor = (payload: string): ReadableStreamDefaultReader<Uint8Array> => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  return stream.getReader();
};

const statsFor = (): {
  readonly stats: {
    contentParts: string[];
    reasoningChars: number;
    startTime: number;
    ttftMs: string | number;
  };
} => ({ stats: { contentParts: [], reasoningChars: 0, startTime: 0, ttftMs: 'N/A' } });

const steadyNow = (): number => 42;

const streamResponse = (payload: string): Response =>
  new Response(payload, {
    headers: { 'Content-Type': 'text/event-stream' },
    status: 200,
  });

const globals: {
  restore: () => void;
} = {
  restore: () => undefined,
};

beforeEach(() => {
  clock = 0;
  const original = {
    clearTimeout: globalThis.clearTimeout,
    setTimeout: globalThis.setTimeout,
  } as const;
  mock(() => {
    Object.defineProperty(globalThis, 'clearTimeout', {
      configurable: true,
      value: mock(() => undefined),
      writable: true,
    });
    Object.defineProperty(globalThis, 'setTimeout', {
      configurable: true,
      value: mock(() => 1),
      writable: true,
    });
    globals.restore = () => {
      Object.defineProperty(globalThis, 'clearTimeout', {
        configurable: true,
        value: original.clearTimeout,
        writable: true,
      });
      Object.defineProperty(globalThis, 'setTimeout', {
        configurable: true,
        value: original.setTimeout,
        writable: true,
      });
    };
  })();
});

afterEach(() => {
  globals.restore();
  mock.restore();
});

test('exposes a generic usage contract that names no vendor or product', () => {
  const text = usage();
  expect(text).toContain('scripts/model-check.ts');
  expect(text).not.toContain('NIM');
  expect(text).not.toContain('nim');
  expect(text).not.toContain('NVIDIA');
  expect(text).not.toContain('nvidia');
  expect(BENCH_COLUMNS).toEqual([
    'Model Name',
    'Status Code',
    'TTFT (ms)',
    'Total Time (ms)',
    'Response / Error Detail',
  ]);
});

test('reads every configured endpoint setting through a generic env reader', () => {
  expect(
    readEnv({
      API_KEY: 'k',
      API_URL: 'https://api.test/v1',
      MODELS: 'm1',
      PROMPT: 'p',
      THINKING_MODELS: 'm1',
    }),
  ).toEqual({
    API_KEY: 'k',
    API_URL: 'https://api.test/v1',
    MODELS: 'm1',
    PROMPT: 'p',
    THINKING_MODELS: 'm1',
  });
  expect(readEnv({})).toEqual({
    API_KEY: undefined,
    API_URL: undefined,
    MODELS: undefined,
    PROMPT: undefined,
    THINKING_MODELS: undefined,
  });
});

test.each([
  [undefined, []],
  ['', []],
  ['   ', []],
  ['model-a', ['model-a']],
  [' model-a , model-b ', ['model-a', 'model-b']],
  ['model-a,,model-b', ['model-a', 'model-b']],
  ['model-a,model-a,model-b', ['model-a', 'model-b']],
])('splits a comma-delimited model list (%s)', (value, expected) => {
  expect(uniqueList(value)).toEqual(expected);
});

test('keeps duplicate entries when splitting a list before de-duplication', () => {
  expect(splitList('model-a,model-a,model-b')).toEqual(['model-a', 'model-a', 'model-b']);
});

test('derives model, thinking-model and prompt values from the endpoint configuration', () => {
  expect(modelsFrom(ENV)).toEqual(['model-a', 'model-b']);
  expect(thinkingModelsFrom(ENV)).toEqual(['model-b']);
  expect(promptFrom(ENV)).toBe('Say hi.');
  expect(promptFrom({ PROMPT: '  ' })).toBe('Respond with exactly the single word: Pong.');
  expect(promptFrom({})).toBe('Respond with exactly the single word: Pong.');
  expect(modelsFrom(NO_ENV)).toEqual([]);
  expect(thinkingModelsFrom(NO_ENV)).toEqual([]);
});

test('reports each missing endpoint configuration value generically', () => {
  expect(missingConfigFrom(ENV)).toEqual([]);
  expect(missingConfigFrom(NO_ENV)).toEqual(['MODELS', 'API_URL', 'API_KEY']);
  expect(missingConfigFrom({ API_KEY: 'k', MODELS: 'model-a' })).toEqual(['API_URL']);
  expect(missingConfigFrom({ API_KEY: 'k', API_URL: 'https://api.test/v1' })).toEqual(['MODELS']);
  expect(missingConfigFrom({ API_KEY: ' ', API_URL: ' ', MODELS: ' ' })).toEqual([
    'MODELS',
    'API_URL',
    'API_KEY',
  ]);
});

test('parses a streamed delta chunk and ignores every malformed shape', () => {
  expect(chunkDelta('{"choices":[{"delta":{"content":"hi"}}]}')).toEqual({
    content: 'hi',
    reasoning: 0,
  });
  expect(chunkDelta('{"choices":[{"delta":{"content":"hi","reasoning_content":"abc"}}]}')).toEqual({
    content: 'hi',
    reasoning: 3,
  });
  expect(chunkDelta('{"choices":[{"delta":{"reasoning_content":"abc"}}]}')).toEqual({
    content: '',
    reasoning: 3,
  });
  expect(chunkDelta('{"choices":[]}')).toBeNull();
  expect(chunkDelta('{"choices":"nope"}')).toBeNull();
  expect(chunkDelta('{"choices":[{"delta":"nope"}]}')).toBeNull();
  expect(chunkDelta('{"choices":[{"delta":null}]}')).toBeNull();
  expect(chunkDelta('not json')).toBeNull();
});

test('extracts an error detail from every supported envelope shape', () => {
  expect(errorDetail({ error: { message: 'boom' } })).toBe('boom');
  expect(errorDetail({ error: 'boom' })).toBe('boom');
  expect(errorDetail({ error: 42 })).toBeNull();
  expect(errorDetail({ ok: true })).toBeNull();
  expect(errorDetail(null)).toBeNull();
  expect(errorDetail('string')).toBeNull();
});

test('classifies a benchmark failure by its error shape', () => {
  const abort = new Error('aborted');
  abort.name = 'AbortError';
  expect(failureFor(abort)).toEqual({
    detail: 'Stream or connection boundary crossed 30s limit.',
    status: 'TIMEOUT',
  });
  expect(failureFor(new Error('refused'))).toEqual({ detail: 'refused', status: 'CONN_ERR' });
  expect(failureFor(new Error(''))).toEqual({
    detail: 'Network exception occurred.',
    status: 'CONN_ERR',
  });
  expect(failureFor('plain string')).toEqual({
    detail: 'Network exception occurred.',
    status: 'CONN_ERR',
  });
});

test('parses an error payload and keeps scanning when it is malformed', () => {
  expect(parsedMessage('{"error":{"message":"boom"}}')).toBe('boom');
  expect(parsedMessage('not json')).toBeNull();
});

test('extracts the first reported API error from a streamed or plain body', () => {
  expect(
    errorMessageFrom('data: {"error":{"message":"first"}}\ndata: {"error":{"message":"second"}}'),
  ).toBe('first');
  expect(errorMessageFrom('data: [DONE]\n')).toBe('Unknown API error.');
  expect(errorMessageFrom('{"error":{"message":"whole"}}')).toBe('whole');
  expect(errorMessageFrom('no error at all')).toBe('Unknown API error.');
  expect(errorMessageFrom('data: plain-text-line')).toBe('Unknown API error.');
});

test('builds a streamed request payload with a default and a thinking-model variant', () => {
  expect(payloadFor('model-a', ENV)).toEqual({
    max_tokens: 500,
    messages: [{ content: 'Say hi.', role: 'user' }],
    model: 'model-a',
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    top_p: 0.9,
  });
  expect(payloadFor('model-b', ENV)).toEqual({
    max_tokens: 2048,
    messages: [{ content: 'Say hi.', role: 'user' }],
    model: 'model-b',
    reasoning_effort: 'low',
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0.7,
    top_p: 0.9,
  });
  expect(payloadFor('model-a', {}).messages).toEqual([
    { content: 'Respond with exactly the single word: Pong.', role: 'user' },
  ]);
});

test('creates a pending benchmark row for each model', () => {
  expect(pendingResultFor('model-a')).toEqual({
    'Model Name': 'model-a',
    'Response / Error Detail': 'None',
    'Status Code': 'UNKNOWN',
    'Total Time (ms)': 'N/A',
    'TTFT (ms)': 'N/A',
  });
});

test('records content, reasoning and the first-token time for each chunk', () => {
  const { stats } = statsFor();
  recordChunk(stats, '{"choices":[{"delta":{"reasoning_content":"abc"}}]}', steadyNow);
  expect(stats.reasoningChars).toBe(3);
  expect(stats.contentParts).toEqual([]);
  expect(stats.ttftMs).toBe('N/A');

  recordChunk(stats, '{"choices":[{"delta":{"content":"hi"}}]}', steadyNow);
  expect(stats.ttftMs).toBe(42);
  recordChunk(stats, '{"choices":[{"delta":{"content":"again"}}]}', constantNow);
  expect(stats.ttftMs).toBe(42);
  expect(stats.contentParts).toEqual(['hi', 'again']);

  recordChunk(stats, 'not json', steadyNow);
  expect(stats.contentParts).toEqual(['hi', 'again']);
});

test('stops consuming at the done sentinel and records every other chunk', () => {
  const { stats } = statsFor();
  expect(consumeChunk(stats, '[DONE]', steadyNow)).toBe(true);
  expect(consumeChunk(stats, '{"choices":[{"delta":{"content":"x"}}]}', steadyNow)).toBe(false);
  expect(stats.contentParts).toEqual(['x']);
});

test('consumes only data-prefixed lines and reports when the stream ends', () => {
  const { stats } = statsFor();
  expect(consumeLines(['noise', 'data: [DONE]'], stats, steadyNow)).toBe(true);
  expect(consumeLines(['noise', 'data: {"choices":[]}'], stats, steadyNow)).toBe(false);
  expect(consumeLines([], stats, steadyNow)).toBe(false);
});

test('drains a reader across chunk boundaries and flushes a trailing data line', async () => {
  const { stats } = statsFor();
  await readDrain(readerFor('data: {"choices":[{"delta":{"content":"a"}}]}\n'), stats, now);
  expect(stats.contentParts).toEqual(['a']);
  expect(stats.ttftMs).toBe(10);

  const finished = readerFor('data: [DONE]\ndata: {"choices":[{"delta":{"content":"skip"}}]}');
  await readDrain(finished, stats, now);
  expect(stats.contentParts).toEqual(['a']);

  const trailing = readerFor('data: {"choices":[{"delta":{"content":"c"}}]}');
  await readDrain(trailing, stats, now);
  expect(stats.contentParts).toEqual(['a', 'c']);

  const empty = readerFor('');
  await readDrain(empty, stats, now);
  expect(stats.contentParts).toEqual(['a', 'c']);
});

test('finalizes a streamed result with content, reasoning or no content', async () => {
  const made = boundaries();
  const withContent = pendingResultFor('model-a');
  const first = await finalizeStream(
    withContent,
    readerFor('data: {"choices":[{"delta":{"content":" Pong "}}]}\n'),
    0,
    1 as never,
    made.boundaries,
  );
  expect(first['Response / Error Detail']).toBe('Pong');
  expect(first['TTFT (ms)']).toBe(10);
  expect(first['Total Time (ms)']).toBe(20);
  expect(made.clearTimeout).toHaveBeenCalledWith(1);
  clock = 0;

  const reasoningOnly = pendingResultFor('model-a');
  clock = 0;
  const second = await finalizeStream(
    reasoningOnly,
    readerFor('data: {"choices":[{"delta":{"reasoning_content":"abc"}}]}\n'),
    0,
    1 as never,
    made.boundaries,
  );
  expect(second['Response / Error Detail']).toBe('No final content in response (reasoning only)');
  expect(second['TTFT (ms)']).toBe('N/A');

  const noContent = pendingResultFor('model-a');
  clock = 0;
  const third = await finalizeStream(
    noContent,
    readerFor('data: {"choices":[]}\n'),
    0,
    1 as never,
    made.boundaries,
  );
  expect(third['Response / Error Detail']).toBe('No content in response');
  expect(third['TTFT (ms)']).toBe('N/A');
  expect(third['Total Time (ms)']).toBe(10);
});

test('fires the abort handler when the configured timeout elapses', async () => {
  const made = boundaries({
    setTimeout: mock((fire: () => void, _ms: number) => {
      fire();
      return 1 as never;
    }),
  });
  const result = await benchmarkModel('model-a', ENV, made.boundaries);
  expect(result['Status Code']).toBe(200);
});

test('benchmarks a model over a successful streamed response', async () => {
  const made = boundaries({
    fetch: mock(() =>
      Promise.resolve(streamResponse('data: {"choices":[{"delta":{"content":"Pong"}}]}\n')),
    ),
  });
  const result = await benchmarkModel('model-a', ENV, made.boundaries);

  expect(result).toEqual({
    'Model Name': 'model-a',
    'Response / Error Detail': 'Pong',
    'Status Code': 200,
    'Total Time (ms)': 20,
    'TTFT (ms)': 10,
  });
  const [url, init] = made.fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://example.invalid/v1/chat/completions');
  expect(init.method).toBe('POST');
  expect(init.body).toBe(
    JSON.stringify({
      max_tokens: 500,
      messages: [{ content: 'Say hi.', role: 'user' }],
      model: 'model-a',
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.7,
      top_p: 0.9,
    }),
  );
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  expect(made.clearTimeout).toHaveBeenCalledTimes(2);
});

test('reports an API error body and a missing stream body', async () => {
  const failed = boundaries({
    fetch: mock(() =>
      Promise.resolve(
        new Response('data: {"error":{"message":"quota"}}', {
          status: 429,
          statusText: 'Too Many',
        }),
      ),
    ),
  });
  const limit = await benchmarkModel('model-a', ENV, failed.boundaries);
  expect(limit['Status Code']).toBe(429);
  expect(limit['Response / Error Detail']).toBe('quota');

  const bodiless = boundaries({
    fetch: mock(() => Promise.resolve(new Response(null, { status: 200 }))),
  });
  const missing = await benchmarkModel('model-a', ENV, bodiless.boundaries);
  expect(missing['Response / Error Detail']).toBe('Readable stream unreadable.');
  expect(missing['Status Code']).toBe(200);
});

test('classifies a failed benchmark by its thrown error shape', async () => {
  const abort = new Error('aborted');
  abort.name = 'AbortError';
  const aborted = boundaries({ fetch: mock(() => Promise.reject(abort)) });
  const timedOut = await benchmarkModel('model-a', ENV, aborted.boundaries);
  expect(timedOut['Status Code']).toBe('TIMEOUT');
  expect(timedOut['Response / Error Detail']).toBe(
    'Stream or connection boundary crossed 30s limit.',
  );

  const refused = boundaries({ fetch: mock(() => Promise.reject(new Error('ECONNREFUSED'))) });
  const conn = await benchmarkModel('model-a', ENV, refused.boundaries);
  expect(conn['Status Code']).toBe('CONN_ERR');
  expect(conn['Response / Error Detail']).toBe('ECONNREFUSED');

  const thrown = boundaries({ fetch: mock(() => Promise.reject('plain string')) });
  const plain = await benchmarkModel('model-a', ENV, thrown.boundaries);
  expect(plain['Status Code']).toBe('CONN_ERR');
  expect(plain['Response / Error Detail']).toBe('Network exception occurred.');
});

test('benchmarks every configured model and reports one row per model', async () => {
  const made = boundaries({
    fetch: mock(() =>
      Promise.resolve(streamResponse('data: {"choices":[{"delta":{"content":"Pong"}}]}\n')),
    ),
  });
  await expect(runBenchmark(ENV, made.boundaries)).resolves.toBe(0);
  expect(made.fetch).toHaveBeenCalledTimes(2);
  const rows = made.table.mock.calls[0]?.[0] as unknown as readonly Record<string, unknown>[];
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row['Model Name']).sort()).toEqual(['model-a', 'model-b']);
  expect(made.log).toHaveBeenCalledWith('\n🚀 Initializing benchmark across 2 endpoint targets...');
  expect(made.log).toHaveBeenCalledWith('📝 Using prompt: "Say hi."\n');
});

test('fails the benchmark before making a request when configuration is missing', async () => {
  const made = boundaries();
  await expect(runBenchmark(NO_ENV, made.boundaries)).resolves.toBe(1);
  expect(made.fetch).not.toHaveBeenCalled();
  expect(made.table).not.toHaveBeenCalled();
  expect(made.error).toHaveBeenCalledWith(
    '❌ Error: MODELS, API_URL, API_KEY is missing. Missing endpoint configuration; check the .env file for this project.',
  );
});

test('routes a benchmark failure through the CLI exit boundary only when main', async () => {
  const made = boundaries();
  await runCli(false, made.boundaries, ENV);
  expect(made.exit).not.toHaveBeenCalled();
  expect(made.fetch).not.toHaveBeenCalled();

  const ok = boundaries({
    fetch: mock(() =>
      Promise.resolve(streamResponse('data: {"choices":[{"delta":{"content":"Pong"}}]}\n')),
    ),
  });
  await runCli(true, ok.boundaries, ENV);
  expect(ok.exit).toHaveBeenCalledWith(0);

  const bad = boundaries();
  await runCli(true, bad.boundaries, NO_ENV);
  expect(bad.exit).toHaveBeenCalledWith(1);
});

test('routes the run entrypoint through the help route and the benchmark route', async () => {
  const helped = boundaries();
  await run(['--help'], helped.boundaries, ENV);
  expect(helped.log).toHaveBeenCalledWith(usage());
  expect(helped.exit).not.toHaveBeenCalled();
  expect(helped.fetch).not.toHaveBeenCalled();

  const short = boundaries();
  await run(['-h'], short.boundaries, ENV);
  expect(short.log).toHaveBeenCalledWith(usage());
  expect(short.fetch).not.toHaveBeenCalled();

  const ran = boundaries({
    fetch: mock(() =>
      Promise.resolve(streamResponse('data: {"choices":[{"delta":{"content":"Pong"}}]}\n')),
    ),
  });
  await expect(run([], ran.boundaries, ENV)).resolves.toBe(0);
  expect(ran.fetch).toHaveBeenCalledTimes(2);
  expect(ran.exit).toHaveBeenCalledWith(0);
});

test('falls back to the default boundaries and environment when none are supplied', async () => {
  const logged = mock((_message: string) => undefined);
  const originalLog = console.log;
  console.log = logged as unknown as typeof console.log;
  try {
    await expect(run(['--help'])).resolves.toBe(0);
    expect(logged).toHaveBeenCalledWith(usage());
  } finally {
    console.log = originalLog;
  }
});

test('writes a diagnostic through the injected writer and exposes default boundaries', () => {
  const writer = mock((_message: string) => undefined);
  expect(readLog('hello', writer)).toBeUndefined();
  expect(writer).toHaveBeenCalledWith('hello');

  const target: { exitCode?: number | string | null } = {};
  processExitCode(3, target);
  expect(target.exitCode).toBe(3);

  const sent = mock((_url: string, _init: RequestInit) =>
    Promise.resolve(new Response('ok', { status: 200 })),
  );
  const out = {
    error: mock((_message: string) => undefined),
    log: mock((_message: string) => undefined),
  };
  const made = cliBoundaries(out, sent);
  made.log('hello');
  made.error('bad');
  expect(out.log).toHaveBeenCalledWith('hello');
  expect(out.error).toHaveBeenCalledWith('bad');
  expect(made.now()).toBeGreaterThanOrEqual(0);
  expect(made.random()).toBeLessThan(1);
  expect(made.exit).toBe(processExitCode);
  expect(made.setTimeout).toBe(setTimeout);
  expect(made.clearTimeout).toBe(clearTimeout);
  expect(made.table).toBe(console.table);
  expect(made.random).toBe(Math.random);
});

test('reads the real platform argv, env, clock, random and timer boundaries', async () => {
  const timers = {
    clearTimeout: mock(() => undefined),
    setTimeout: mock(() => 1 as never),
  };
  const originalClearTimeout = globalThis.clearTimeout;
  const originalSetTimeout = globalThis.setTimeout;
  Object.defineProperty(globalThis, 'clearTimeout', {
    configurable: true,
    value: timers.clearTimeout,
    writable: true,
  });
  Object.defineProperty(globalThis, 'setTimeout', {
    configurable: true,
    value: timers.setTimeout,
    writable: true,
  });
  globals.restore = () => {
    Object.defineProperty(globalThis, 'clearTimeout', {
      configurable: true,
      value: originalClearTimeout,
      writable: true,
    });
    Object.defineProperty(globalThis, 'setTimeout', {
      configurable: true,
      value: originalSetTimeout,
      writable: true,
    });
  };

  expect(Bun.argv.length).toBeGreaterThan(0);
  expect(typeof Bun.env.PATH).toBe('string');

  const made = cliBoundaries();
  expect(made.setTimeout).toBe(timers.setTimeout as unknown as typeof setTimeout);
  expect(made.clearTimeout).toBe(timers.clearTimeout);
  expect(made.now()).toBeGreaterThanOrEqual(0);
  expect(made.random()).toBeGreaterThanOrEqual(0);
  expect(made.random()).toBeLessThan(1);
});
