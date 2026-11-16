import { afterEach, describe, expect, mock, test } from 'bun:test';
import * as actualCrypto from 'node:crypto';
import * as actualFs from 'node:fs/promises';
import * as actualOs from 'node:os';
import actualPath from 'node:path';

const accessMock = mock(async (_target: string) => undefined);
const mkdirMock = mock(async (_target: string) => undefined);
const realpathMock = mock(async (target: string) => target);
const readFileMock = mock(async (_target: string) => new Uint8Array());
const writeFileMock = mock(async (_target: string, _content: string | Uint8Array) => undefined);
mock.module('node:fs/promises', () => ({
  ...actualFs,
  access: accessMock,
  mkdir: mkdirMock,
  readFile: readFileMock,
  realpath: realpathMock,
  writeFile: writeFileMock,
}));
mock.module('node:crypto', () => ({
  ...actualCrypto,
  createHash: mock(() => ({
    digest: mock(() => 'fake-sha256'),
    update: mock(() => ({ digest: mock(() => 'fake-sha256'), update: mock(() => undefined) })),
  })),
  randomUUID: mock(() => '00000000-0000-4000-8000-000000000001'),
}));
mock.module('node:os', () => ({
  ...actualOs,
  arch: mock(() => 'arm64'),
  cpus: mock(() => [{ model: 'Apple M4 Max' }]),
  platform: mock(() => 'darwin'),
  release: mock(() => '25.7.0'),
  tmpdir: mock(() => '/tmp'),
}));
const pathMock = {
  ...actualPath,
  isAbsolute: mock(actualPath.isAbsolute),
  join: mock(actualPath.join),
  relative: mock(actualPath.relative),
  resolve: mock(actualPath.resolve),
};
mock.module('node:path', () => ({ default: pathMock }));
mock.module('../../scripts/weak-reader.js', () => ({
  MAX_NEW_TOKENS: 8,
  MODEL_ID: 'test/model',
  MODEL_REVISION: 'a'.repeat(40),
  READER_VERSION: 'reader-v1',
  VENDORED_BUNDLE_PATH: 'vendor/gemma.js.gz',
  VENDORED_BUNDLE_SHA256: 'c'.repeat(64),
}));

const {
  defaultDependencies,
  parseDisplayProfile,
  parseOptions,
  parseReaderMetrics,
  parseTimeMetrics,
  runBenchmark,
  runCli,
} = await import('../../scripts/weak-reader-benchmark.js');

const ANSWER = '{"answer":"A","query_id":"q1","run":1}\n';
const BUNDLE = JSON.stringify({
  document: 'short document',
  instructions: 'answer A',
  prompts: [{ query: 'Q1?', query_id: 'q1', run: 1 }],
});
const READER_LOG = `[weak-reader] GPU ready; context 20/8192 tokens; answered 1 probes from 1 queries; load 1.200 s, warmup 0.300 s, total 2.100 s; last query first token 0.200 s, total 0.250 s; model revision ${'a'.repeat(40)}; runtime bundle ${'c'.repeat(64)}`;
const TIME_LOG =
  '2.10 real 1.50 user 0.40 sys\n100000 maximum resident set size\n200000 peak memory footprint';

interface FakeHost {
  readonly activeReaders: number;
  readonly commandCalls: readonly (readonly string[])[];
  readonly deps: Parameters<typeof runBenchmark>[1];
  readonly files: Map<string, Uint8Array>;
  readonly maxActiveReaders: number;
  readonly writes: Map<string, string | Uint8Array>;
}

interface FakeHostOptions {
  readonly answerMissingAt?: number;
  readonly answers?: (readerIndex: number) => string;
  readonly display?: string;
  readonly emptyHash?: boolean;
  readonly failMacOSVersion?: boolean;
  readonly failReaderAt?: number;
  readonly platform?: string;
  readonly readerExitCode?: number;
  readonly readerLog?: string;
  readonly realPaths?: Readonly<Record<string, string>>;
  readonly throwOnRead?: string;
  readonly zeroClock?: boolean;
}

interface FakeHostState {
  activeReaders: number;
  commandCalls: string[][];
  files: Map<string, Uint8Array>;
  maxActiveReaders: number;
  readerIndex: number;
  writes: Map<string, string | Uint8Array>;
}

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

const displayProfileResult = (hostOptions: FakeHostOptions) => {
  const failed =
    hostOptions.display === 'command-failed'
    || hostOptions.display === 'command-failed-with-output';
  const defaultDisplay = 'Chipset Model: Apple M4 Max\nMetal Support: Metal 4\n';
  const stdout =
    hostOptions.display === 'command-failed'
      ? ''
      : hostOptions.display === 'command-failed-with-output'
        ? defaultDisplay
        : (hostOptions.display ?? defaultDisplay);
  return {
    exitCode: failed ? 1 : 0,
    stderr: failed ? 'unavailable' : '',
    stdout,
  };
};

const macOSVersionResult = (hostOptions: FakeHostOptions) =>
  hostOptions.failMacOSVersion
    ? { exitCode: 1, stderr: 'unavailable', stdout: '' }
    : { exitCode: 0, stderr: '', stdout: '26.7.3\n' };

const options = (repeats = 3) => ({
  bundlePath: '/private/tmp/bundle.json',
  expectedAnswersPath: '/private/tmp/expected.jsonl',
  outputRoot: '/private/tmp/benchmark',
  repeats,
});

const readerProcessResult = async (
  command: readonly string[],
  hostOptions: FakeHostOptions,
  state: FakeHostState,
) => {
  const answerPath = command.at(-1) ?? '';
  const currentReaderIndex = state.readerIndex;
  state.readerIndex += 1;
  state.activeReaders += 1;
  state.maxActiveReaders = Math.max(state.maxActiveReaders, state.activeReaders);
  await Promise.resolve();
  state.activeReaders -= 1;
  const answer = hostOptions.answers?.(currentReaderIndex) ?? ANSWER;
  if (hostOptions.answerMissingAt !== currentReaderIndex) {
    state.files.set(answerPath, bytes(answer));
  }
  const readerOutput =
    hostOptions.failReaderAt === currentReaderIndex
      ? 'reader summary missing'
      : (hostOptions.readerLog ?? READER_LOG);
  return {
    exitCode: hostOptions.readerExitCode ?? 0,
    stderr: `${readerOutput}\n${TIME_LOG}`,
    stdout: '',
  };
};

const fakeHostCommand = async (
  command: readonly string[],
  hostOptions: FakeHostOptions,
  state: FakeHostState,
) => {
  state.commandCalls.push([...command]);
  switch (command[0]) {
    case 'sw_vers':
      return macOSVersionResult(hostOptions);
    case '/usr/sbin/system_profiler':
      return displayProfileResult(hostOptions);
    case '/usr/bin/time':
      return readerProcessResult(command, hostOptions, state);
    default:
      return { exitCode: 1, stderr: `unexpected: ${command.join(' ')}`, stdout: '' };
  }
};

const fakeHost = (hostOptions: FakeHostOptions = {}): FakeHost => {
  const files = new Map<string, Uint8Array>([
    ['/private/tmp', bytes('')],
    ['/private/tmp/bundle.json', bytes(BUNDLE)],
    ['/private/tmp/expected.jsonl', bytes(ANSWER)],
    ['/agents/vendor/gemma.js.gz', bytes('compressed vendor')],
  ]);
  const writes = new Map<string, string | Uint8Array>();
  const state: FakeHostState = {
    activeReaders: 0,
    commandCalls: [],
    files,
    maxActiveReaders: 0,
    readerIndex: 0,
    writes,
  };
  let clock = 0;
  const deps: Parameters<typeof runBenchmark>[1] = {
    architecture: 'arm64',
    bunVersion: '1.4.4',
    cpuModel: 'Apple M4 Max',
    exists: async (target) => files.has(target) || writes.has(target),
    hash: (content) => {
      if (hostOptions.emptyHash) {
        return '';
      }
      const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
      return `sha:${text.length}:${text.slice(0, 12)}`;
    },
    mkdir: async () => undefined,
    now: () => {
      clock += 10;
      return hostOptions.zeroClock ? 0 : clock;
    },
    nowUtc: () => '2026-11-15T00:00:00.000Z',
    osRelease: '25.7.0',
    platform: hostOptions.platform ?? 'darwin',
    readBytes: async (target) => {
      if (target === hostOptions.throwOnRead) {
        throw new Error(`read failed: ${target}`);
      }
      const content = files.get(target);
      if (!content) {
        throw new Error(`missing fixture: ${target}`);
      }
      return content;
    },
    realpath: async (target) => hostOptions.realPaths?.[target] ?? actualPath.resolve(target),
    runCommand: (command) => fakeHostCommand(command, hostOptions, state),
    tempRoot: '/private/tmp',
    uuid: () => '00000000-0000-4000-8000-000000000001',
    writeBytes: async (target, content) => {
      writes.set(target, content);
    },
    writeLine: () => undefined,
  };
  return {
    get activeReaders() {
      return state.activeReaders;
    },
    commandCalls: state.commandCalls,
    deps,
    files,
    get maxActiveReaders() {
      return state.maxActiveReaders;
    },
    writes,
  };
};

const profile = {
  maxNewTokens: 8,
  modelId: 'test/model',
  modelRevision: 'a'.repeat(40),
  readerVersion: 'reader-v1',
  runtimeBundleSha256: 'c'.repeat(64),
  vendorArchivePath: '/agents/vendor/gemma.js.gz',
};

afterEach(() => {
  accessMock.mockClear();
  mkdirMock.mockClear();
  realpathMock.mockClear();
  readFileMock.mockClear();
  writeFileMock.mockClear();
});

describe('weak-reader benchmark inputs and measurements', () => {
  test('accepts absolute paths and explicit repeated samples inside OS temp', () => {
    expect(
      parseOptions(
        [
          '/private/tmp/bundle.json',
          '/private/tmp/out',
          '--repeats',
          '3',
          '--expected-answers',
          '/private/tmp/golden.jsonl',
        ],
        '/private/tmp',
      ),
    ).toEqual({
      bundlePath: '/private/tmp/bundle.json',
      expectedAnswersPath: '/private/tmp/golden.jsonl',
      outputRoot: '/private/tmp/out',
      repeats: 3,
    });
    expect(
      parseOptions(
        ['/private/tmp/bundle.json', '/private/tmp/out', '--repeats', '3'],
        '/var/folders/user/T',
        'darwin',
      ).outputRoot,
    ).toBe('/private/tmp/out');
  });

  test.each([
    { args: ['--help'], message: 'Usage:', temp: '/private/tmp' },
    { args: [], message: 'Usage:', temp: '/private/tmp' },
    {
      args: ['/tmp/bundle', '/Users/rhuang/.agents/out', '--repeats', '3'],
      message: 'inside the OS temporary directory',
      temp: '/private/tmp',
    },
    {
      args: ['/tmp/bundle', '/private/tmp/out', '--repeats', '2'],
      message: 'at least 3',
      temp: '/private/tmp',
    },
    {
      args: ['/tmp/bundle', '/private/tmp/out', '--repeats', 'three'],
      message: 'at least 3',
      temp: '/private/tmp',
    },
    {
      args: ['/tmp/bundle', '/private/tmp/out', '--repeats', '3', '--repeats', '4'],
      message: 'duplicate option',
      temp: '/private/tmp',
    },
    {
      args: ['/tmp/bundle', '/private/tmp/out', '--repeats', '3', '--expected-answers', 'relative'],
      message: 'Invalid or duplicate option',
      temp: '/private/tmp',
    },
  ])('rejects invalid command shape %#', ({ args, temp, message }) => {
    expect(() => parseOptions(args, temp)).toThrow(message);
  });

  test('parses macOS time output and rejects incomplete resource data', () => {
    expect(
      parseTimeMetrics(
        '55.49 real 49.25 user 7.87 sys\n3,818,045,440 maximum resident set size\n8,608,863,872 peak memory footprint',
      ),
    ).toEqual({
      maximumResidentSetBytes: 3818045440,
      peakMemoryFootprintBytes: 8608863872,
      realMs: 55490,
      systemMs: 7870,
      userMs: 49250,
    });
    expect(parseTimeMetrics('55.49 real only')).toBeNull();
    const huge = '9'.repeat(400);
    expect(
      parseTimeMetrics(
        `${huge} real 1 user 1 sys\n1 maximum resident set size\n1 peak memory footprint`,
      ),
    ).toBeNull();
  });

  test('parses reader timing and GPU identity fields', () => {
    expect(parseReaderMetrics(READER_LOG)).toEqual({
      answeredProbes: 1,
      contextCapacity: 8192,
      contextTokens: 20,
      gpuReady: true,
      lastQueryFirstTokenMs: 200,
      lastQueryTotalMs: 250,
      loadMs: 1200,
      modelRevision: 'a'.repeat(40),
      queryCount: 1,
      runtimeBundleSha256: 'c'.repeat(64),
      totalMs: 2100,
      warmupMs: 300,
    });
    expect(parseReaderMetrics('no summary')).toBeNull();
    const hugeReaderLog = READER_LOG.replace('context 20/8192', `context ${'9'.repeat(400)}/8192`);
    expect(parseReaderMetrics(hugeReaderLog)).toBeNull();
    expect(parseDisplayProfile('Chipset Model: Apple M4 Max\nMetal Support: Metal 4')).toEqual({
      adapter: 'Apple M4 Max',
      metalSupport: 'Metal 4',
    });
    expect(parseDisplayProfile('not GPU output')).toEqual({ adapter: null, metalSupport: null });
  });
});

describe('weak-reader benchmark paired execution', () => {
  test('runs warmup then alternating serial and two-process groups with exact answer parity', async () => {
    const host = fakeHost();
    const report = await runBenchmark(options(), host.deps, profile);
    expect(report.status).toBe('measured');
    expect(report.pairs).toHaveLength(3);
    expect(report.pairs.map(({ firstMode }) => firstMode)).toEqual([
      'serial-2',
      'parallel-2',
      'serial-2',
    ]);
    expect(
      report.pairs.every(
        ({ serial2, parallel2 }) => serial2.samples.length === 2 && parallel2.samples.length === 2,
      ),
    ).toBe(true);
    expect(
      report.pairs.every(({ parallelToSerialSpeedup }) => parallelToSerialSpeedup !== null),
    ).toBe(true);
    expect(report.answerParity).toEqual({
      allByteIdentical: true,
      expectedAnswersChecked: true,
      uniqueHashes: [`sha:${ANSWER.length}:${ANSWER.slice(0, 12)}`],
    });
    expect(report.environment.adapter).toBe('Apple M4 Max');
    expect(report.environment.probes).toEqual([
      { command: ['sw_vers', '-productVersion'], exitCode: 0 },
      { command: ['/usr/sbin/system_profiler', 'SPDisplaysDataType'], exitCode: 0 },
    ]);
    expect(report.model.vendorArchiveSha256).toContain('sha:');
    expect(host.maxActiveReaders).toBe(2);
    expect(host.commandCalls.filter((command) => command[0] === '/usr/bin/time')).toHaveLength(13);
    expect(host.writes.has(`${report.runDirectory}/measurement.json`)).toBe(true);
  });
});

describe('weak-reader benchmark host eligibility', () => {
  test('blocks without macOS GPU identity and records no reader execution', async () => {
    const host = fakeHost({ platform: 'linux' });
    const report = await runBenchmark(options(), host.deps, profile);
    expect(report.status).toBe('blocked');
    expect(report.failureReasons).toContain('GPU host, macOS, or adapter identity is unavailable.');
    expect(report.pairs).toHaveLength(0);
    expect(report.environment.probes).toEqual([]);
    expect(host.commandCalls.some((command) => command[0] === '/usr/bin/time')).toBe(false);
    expect(host.writes.has(`${report.runDirectory}/measurement.json`)).toBe(true);
  });

  test('blocks when system_profiler cannot identify an adapter', async () => {
    const host = fakeHost({ display: 'command-failed' });
    const report = await runBenchmark(options(), host.deps, profile);
    expect(report.status).toBe('blocked');
    expect(report.pairs).toHaveLength(0);
  });

  test('blocks when adapter text exists but its probe failed or Metal is unsupported', async () => {
    const failedProbe = await runBenchmark(
      options(),
      fakeHost({ display: 'command-failed-with-output' }).deps,
      profile,
    );
    expect(failedProbe.status).toBe('blocked');
    const unsupportedMetal = await runBenchmark(
      options(),
      fakeHost({ display: 'Chipset Model: Apple M4 Max\nMetal Support: Unsupported' }).deps,
      profile,
    );
    expect(unsupportedMetal.status).toBe('blocked');
  });

  test('rejects CPU-only summaries, empty answers, and answer counts that differ from the bundle', async () => {
    const cpuLog = READER_LOG.replace('[weak-reader] GPU ready;', '[weak-reader] GPU unavailable;');
    expect(
      (await runBenchmark(options(), fakeHost({ readerLog: cpuLog }).deps, profile)).status,
    ).toBe('failed');
    expect(
      (await runBenchmark(options(), fakeHost({ answers: () => '' }).deps, profile)).status,
    ).toBe('failed');
    expect(
      (await runBenchmark(options(), fakeHost({ answers: () => `${ANSWER}\n` }).deps, profile))
        .status,
    ).toBe('failed');
    expect(
      (await runBenchmark(options(), fakeHost({ answerMissingAt: 0 }).deps, profile)).status,
    ).toBe('failed');
    const wrongCount = READER_LOG.replace('answered 1 probes', 'answered 0 probes');
    expect(
      (await runBenchmark(options(), fakeHost({ readerLog: wrongCount }).deps, profile)).status,
    ).toBe('failed');
  });

  test('blocks when macOS version capture fails or a required archive hash is missing', async () => {
    const osHost = fakeHost({ failMacOSVersion: true });
    const osReport = await runBenchmark(options(), osHost.deps, profile);
    expect(osReport.status).toBe('blocked');
    expect(osReport.pairs).toHaveLength(0);
    const hashHost = fakeHost({ emptyHash: true });
    const hashReport = await runBenchmark(options(), hashHost.deps, profile);
    expect(hashReport.status).toBe('blocked');
    expect(hashReport.failureReasons).toContain('Vendor runtime archive hash is unavailable.');
  });
});

describe('weak-reader benchmark sample integrity', () => {
  test('fails on a reader error without treating it as a sample', async () => {
    const host = fakeHost({ readerExitCode: 2 });
    const report = await runBenchmark(options(), host.deps, profile);
    expect(report.status).toBe('failed');
    expect(report.warmup?.status).toBe('failed');
    expect(report.pairs).toHaveLength(0);
    expect(report.failureReasons).toContain(
      'Warm-cache run did not produce GPU-ready output, one answer per prompt, and complete /usr/bin/time metrics.',
    );
  });

  test('stops after a warmup answer differs from the supplied baseline', async () => {
    const host = fakeHost({ answers: () => '{"answer":"B"}\n' });
    const report = await runBenchmark(options(), host.deps, profile);
    expect(report.status).toBe('failed');
    expect(report.pairs).toHaveLength(0);
    expect(report.failureReasons).toContain(
      'Warmup answers differ byte-for-byte from the supplied baseline.',
    );
  });

  test('retains answer drift and fails comparison when paired processes disagree', async () => {
    const host = fakeHost({ answers: (index) => (index < 1 ? ANSWER : '{"answer":"B"}\n') });
    const report = await runBenchmark(
      { ...options(), expectedAnswersPath: undefined },
      host.deps,
      profile,
    );
    expect(report.status).toBe('failed');
    expect(report.answerParity.allByteIdentical).toBe(false);
    expect(report.answerParity.uniqueHashes.length).toBeGreaterThan(1);
    expect(report.failureReasons).toContain(
      'Answer JSONL changed between the warmup and paired benchmark processes.',
    );
  });

  test('retains an incomplete paired process as failed evidence and handles a zero-duration group', async () => {
    const failedHost = fakeHost({ failReaderAt: 1 });
    const failed = await runBenchmark(options(), failedHost.deps, profile);
    expect(failed.status).toBe('failed');
    expect(failed.failureReasons).toContain(
      'serial-2 repeat 1 produced an incomplete process sample.',
    );
    const zeroHost = fakeHost({ zeroClock: true });
    const zero = await runBenchmark(options(), zeroHost.deps, profile);
    expect(zero.status).toBe('measured');
    expect(
      zero.pairs.every(({ parallelToSerialSpeedup }) => parallelToSerialSpeedup === null),
    ).toBe(true);
  });
});

describe('weak-reader benchmark input validation', () => {
  test('rejects a missing bundle and an existing run id before measurement', async () => {
    const missingHost = fakeHost();
    await expect(
      runBenchmark(
        { ...options(), bundlePath: '/private/tmp/missing.json' },
        missingHost.deps,
        profile,
      ),
    ).rejects.toThrow('Bundle not found');
    const existingHost = fakeHost();
    existingHost.files.set(
      '/private/tmp/benchmark/00000000-0000-4000-8000-000000000001',
      bytes('existing'),
    );
    await expect(runBenchmark(options(), existingHost.deps, profile)).rejects.toThrow(
      'already exists',
    );
    await expect(
      runBenchmark({ ...options(), repeats: 2 }, fakeHost().deps, profile),
    ).rejects.toThrow('at least three paired repetitions');
    await expect(
      runBenchmark({ ...options(), outputRoot: '/Users/rhuang/out' }, fakeHost().deps, profile),
    ).rejects.toThrow('inside the OS temporary directory');
    const missingTemp = fakeHost();
    await expect(
      runBenchmark(options(), { ...missingTemp.deps, exists: async () => false }, profile),
    ).rejects.toThrow('resolve inside the OS temporary directory');
    const symlinkHost = fakeHost({ realPaths: { '/private/tmp/link': '/Users/rhuang/.agents' } });
    symlinkHost.files.set('/private/tmp/link', bytes('symlink'));
    await expect(
      runBenchmark(
        { ...options(), outputRoot: '/private/tmp/link/output' },
        symlinkHost.deps,
        profile,
      ),
    ).rejects.toThrow('resolve inside the OS temporary directory');
  });

  test('rejects malformed, primitive, and incomplete bundles', async () => {
    const invalidJson = fakeHost();
    invalidJson.files.set('/private/tmp/bundle.json', bytes('{'));
    await expect(runBenchmark(options(), invalidJson.deps, profile)).rejects.toThrow(
      'not valid JSON',
    );
    const primitive = fakeHost();
    primitive.files.set('/private/tmp/bundle.json', bytes('null'));
    await expect(runBenchmark(options(), primitive.deps, profile)).rejects.toThrow('JSON object');
    const missingFields = fakeHost();
    missingFields.files.set(
      '/private/tmp/bundle.json',
      bytes(JSON.stringify({ document: '', prompts: [] })),
    );
    await expect(runBenchmark(options(), missingFields.deps, profile)).rejects.toThrow(
      'requires document',
    );
  });
});

describe('weak-reader benchmark CLI', () => {
  test('validates CLI help and usage without launching a process', async () => {
    const host = fakeHost();
    const messages: string[] = [];
    const deps = {
      ...host.deps,
      writeLine: (_stream: 'stderr' | 'stdout', message: string) => messages.push(message),
    };
    expect(await runCli(['--help'], deps)).toBe(0);
    expect(await runCli([], deps)).toBe(2);
    expect(messages[0]).toContain('Usage:');
    expect(messages[1]).toContain('Usage:');
    expect(host.commandCalls).toHaveLength(0);
  });

  test('runs the CLI through measured, blocked, and unexpected-error outcomes', async () => {
    const measuredHost = fakeHost();
    const output: string[] = [];
    const baseRead = measuredHost.deps.readBytes;
    const measuredDeps = {
      ...measuredHost.deps,
      readBytes: async (target: string) =>
        target.endsWith('/vendor/gemma.js.gz') ? bytes('compressed vendor') : baseRead(target),
      writeLine: (_stream: 'stderr' | 'stdout', message: string) => output.push(message),
    };
    expect(
      await runCli(
        [
          '/private/tmp/bundle.json',
          '/private/tmp/benchmark',
          '--repeats',
          '3',
          '--expected-answers',
          '/private/tmp/expected.jsonl',
        ],
        measuredDeps,
      ),
    ).toBe(0);
    expect(output[0]).toContain('measured:');

    const blockedHost = fakeHost({ platform: 'linux' });
    const blockedOutput: string[] = [];
    const blockedBaseRead = blockedHost.deps.readBytes;
    const blockedDeps = {
      ...blockedHost.deps,
      readBytes: async (target: string) =>
        target.endsWith('/vendor/gemma.js.gz')
          ? bytes('compressed vendor')
          : blockedBaseRead(target),
      writeLine: (_stream: 'stderr' | 'stdout', message: string) => blockedOutput.push(message),
    };
    expect(
      await runCli(
        ['/private/tmp/bundle.json', '/private/tmp/benchmark', '--repeats', '3'],
        blockedDeps,
      ),
    ).toBe(1);
    expect(blockedOutput.some((message) => message.includes('GPU host'))).toBe(true);

    const errorHost = fakeHost();
    const errorOutput: string[] = [];
    const errorBaseRead = errorHost.deps.readBytes;
    const errorDeps = {
      ...errorHost.deps,
      readBytes: async (target: string) =>
        target.endsWith('/vendor/gemma.js.gz') ? bytes('compressed vendor') : errorBaseRead(target),
      runCommand: async () => Promise.reject('raw host error'),
      writeLine: (_stream: 'stderr' | 'stdout', message: string) => errorOutput.push(message),
    };
    expect(
      await runCli(
        ['/private/tmp/bundle.json', '/private/tmp/benchmark', '--repeats', '3'],
        errorDeps,
      ),
    ).toBe(1);
    expect(errorOutput).toContain('raw host error');
  });
});

describe('weak-reader benchmark default boundary adapter', () => {
  test('constructs host metadata and injected command runner without spawning a live process', async () => {
    const stream = (content: string): ReadableStream<Uint8Array> =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes(content));
          controller.close();
        },
      });
    const spawned = mock(
      (_command: string[], _options: { cwd: string; stderr: 'pipe'; stdout: 'pipe' }) => ({
        exited: Promise.resolve(7),
        stderr: stream('err'),
        stdout: stream('out'),
      }),
    );
    const log = mock(() => undefined);
    const error = mock(() => undefined);
    const deps = defaultDependencies(spawned, { error, log });
    expect(deps.platform).toBe('darwin');
    expect(deps.architecture).toBe('arm64');
    expect(deps.cpuModel).toBe('Apple M4 Max');
    expect(deps.tempRoot).toBe('/tmp');
    expect(deps.now()).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(Date.parse(deps.nowUtc()))).toBe(true);
    expect(await deps.exists('/tmp/test')).toBe(true);
    expect(await deps.realpath('/tmp/test')).toBe('/tmp/test');
    await deps.mkdir('/tmp/created');
    await deps.writeBytes('/tmp/output', bytes('out'));
    expect(await deps.readBytes('/tmp/input')).toEqual(new Uint8Array());
    expect(deps.hash('text')).toBe('fake-sha256');
    expect(deps.uuid()).toBe('00000000-0000-4000-8000-000000000001');
    accessMock.mockRejectedValueOnce(new Error('missing'));
    expect(await deps.exists('/tmp/missing')).toBe(false);
    expect(await deps.runCommand(['probe'], '/tmp')).toEqual({
      exitCode: 7,
      stderr: 'err',
      stdout: 'out',
    });
    deps.writeLine('stderr', 'error output');
    deps.writeLine('stdout', 'normal output');
    expect(mkdirMock).toHaveBeenCalledWith('/tmp/created', { recursive: true });
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/output', bytes('out'));
    expect(spawned).toHaveBeenCalledWith(['probe'], {
      cwd: '/tmp',
      stderr: 'pipe',
      stdout: 'pipe',
    });
    expect(error).toHaveBeenCalledWith('error output');
    expect(log).toHaveBeenCalledWith('normal output');
  });

  test('uses the pinned reader profile when a caller does not provide an override', async () => {
    const host = fakeHost();
    const expectedArchive = actualPath.resolve('/Users/rhuang/.agents', 'vendor/gemma.js.gz');
    const originalRead = host.deps.readBytes;
    const deps = {
      ...host.deps,
      readBytes: async (target: string) =>
        target === expectedArchive ? bytes('compressed vendor') : originalRead(target),
    };
    const report = await runBenchmark(options(), deps);
    expect(report.status).toBe('measured');
    expect(report.model.modelId).toBe('test/model');
    expect(report.model.vendorArchivePath).toBe(expectedArchive);
  });
});
