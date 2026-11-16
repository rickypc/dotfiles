import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, realpath as resolveRealPath, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import path from 'node:path';
import {
  MAX_NEW_TOKENS,
  MODEL_ID,
  MODEL_REVISION,
  READER_VERSION,
  VENDORED_BUNDLE_PATH,
  VENDORED_BUNDLE_SHA256,
} from './weak-reader.js';

export interface BenchmarkDependencies {
  readonly architecture: string;
  readonly bunVersion: string;
  readonly cpuModel: string;
  readonly exists: (target: string) => Promise<boolean>;
  readonly hash: (content: string | Uint8Array) => string;
  readonly mkdir: (target: string) => Promise<void>;
  readonly now: () => number;
  readonly nowUtc: () => string;
  readonly osRelease: string;
  readonly platform: string;
  readonly readBytes: (target: string) => Promise<Uint8Array>;
  readonly realpath: (target: string) => Promise<string>;
  readonly runCommand: (command: readonly string[], cwd: string) => Promise<CommandResult>;
  readonly tempRoot: string;
  readonly uuid: () => string;
  readonly writeBytes: (target: string, content: string | Uint8Array) => Promise<void>;
  readonly writeLine: (stream: 'stderr' | 'stdout', message: string) => void;
}

export interface BenchmarkOptions {
  readonly bundlePath: string;
  readonly expectedAnswersPath?: string;
  readonly outputRoot: string;
  readonly repeats: number;
}

export interface BenchmarkReport {
  readonly answerParity: {
    readonly allByteIdentical: boolean;
    readonly expectedAnswersChecked: boolean;
    readonly uniqueHashes: readonly string[];
  };
  readonly bundle: BundleProfile & { readonly path: string; readonly sha256: string };
  readonly environment: MachineProfile;
  readonly failureReasons: readonly string[];
  readonly generatedAtUtc: string;
  readonly model: ReaderProfile & {
    readonly modelRevisionSha256: string;
    readonly vendorArchiveSha256: string;
  };
  readonly pairs: readonly {
    readonly firstMode: ReaderGroup['mode'];
    readonly parallel2: ReaderGroup;
    readonly parallelToSerialSpeedup: number | null;
    readonly repeat: number;
    readonly serial2: ReaderGroup;
  }[];
  readonly runDirectory: string;
  readonly runId: string;
  readonly schemaVersion: 1;
  readonly status: 'blocked' | 'failed' | 'measured';
  readonly warmup?: ReaderSample;
}

interface BenchmarkSamples {
  readonly answers: Uint8Array[];
  readonly failures: string[];
  readonly pairs: Array<BenchmarkReport['pairs'][number]>;
  readonly status: BenchmarkReport['status'];
  readonly warmup?: ReaderSample;
}

interface BundleProfile {
  readonly documentBytes: number;
  readonly instructionBytes: number;
  readonly promptCount: number;
}

export interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

interface ConsoleWriter {
  readonly error: (message: string) => void;
  readonly log: (message: string) => void;
}

interface MachineProfile {
  readonly adapter: string | null;
  readonly architecture: string;
  readonly bunVersion: string;
  readonly cpuModel: string;
  readonly macOSVersion: string | null;
  readonly metalSupport: string | null;
  readonly osRelease: string;
  readonly platform: string;
  readonly probes: readonly {
    readonly command: readonly string[];
    readonly exitCode: number;
  }[];
}

type ParsedFlagOptions = { repeats?: number; expectedAnswersPath?: string };

interface PreparedBenchmark {
  readonly bundle: BenchmarkReport['bundle'];
  readonly environment: MachineProfile;
  readonly expectedBytes?: Uint8Array;
  readonly failures: string[];
  readonly model: BenchmarkReport['model'];
  readonly runDirectory: string;
  readonly runId: string;
  readonly status: BenchmarkReport['status'];
}

interface ReaderGroup {
  readonly mode: 'parallel-2' | 'serial-2';
  readonly samples: readonly ReaderSample[];
  readonly wallMs: number;
}

interface ReaderMetrics {
  readonly answeredProbes: number;
  readonly contextCapacity: number;
  readonly contextTokens: number;
  readonly gpuReady: boolean;
  readonly lastQueryFirstTokenMs: number;
  readonly lastQueryTotalMs: number;
  readonly loadMs: number;
  readonly modelRevision: string;
  readonly queryCount: number;
  readonly runtimeBundleSha256: string;
  readonly totalMs: number;
  readonly warmupMs: number;
}

export interface ReaderProfile {
  readonly maxNewTokens: number;
  readonly modelId: string;
  readonly modelRevision: string;
  readonly readerVersion: string;
  readonly runtimeBundleSha256: string;
  readonly vendorArchivePath: string;
}

interface ReaderSample {
  readonly answerBytes?: number;
  readonly answerPath: string;
  readonly answerSha256?: string;
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly reader?: ReaderMetrics;
  readonly status: 'measured' | 'failed';
  readonly stderrPath: string;
  readonly stdoutPath: string;
  readonly time?: TimeMetrics;
  readonly wallMs: number;
}

interface SpawnedProcess {
  readonly exited: Promise<number>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly stdout: ReadableStream<Uint8Array>;
}

type SpawnProcess = (
  command: string[],
  options: { readonly cwd: string; readonly stderr: 'pipe'; readonly stdout: 'pipe' },
) => SpawnedProcess;

interface TimeMetrics {
  readonly maximumResidentSetBytes: number;
  readonly peakMemoryFootprintBytes: number;
  readonly realMs: number;
  readonly systemMs: number;
  readonly userMs: number;
}

const ROOT = path.resolve(import.meta.dir, '..');
const READER_PATH = path.join(import.meta.dir, 'weak-reader.ts');
const USAGE =
  'Usage: bun scripts/weak-reader-benchmark.ts <absolute-bundle.json> <absolute-output-root-under-os-tmp> --repeats <count>=3+ [--expected-answers <absolute-answers.jsonl>]';
const TIME_COMMAND = '/usr/bin/time';
const WORKERS_PER_GROUP = 2;

const addFlag = (
  flag: string | undefined,
  value: string | undefined,
  seen: Set<string>,
  parsed: ParsedFlagOptions,
): void => {
  if (!flag || value === undefined || seen.has(flag)) {
    throw new Error(`Invalid or duplicate option: ${flag ?? ''}`);
  }
  seen.add(flag);
  if (flag === '--repeats') {
    parsed.repeats = Number(value);
    return;
  }
  if (flag === '--expected-answers' && path.isAbsolute(value)) {
    parsed.expectedAnswersPath = value;
    return;
  }
  throw new Error(`Invalid or duplicate option: ${flag}`);
};

const isStrictChildPath = (parent: string, child: string): boolean => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
};

const isOsTempChild = (tempRoot: string, outputRoot: string, hostPlatform: string): boolean => {
  const roots = [tempRoot, ...(hostPlatform === 'darwin' ? ['/private/tmp', '/tmp'] : [])];
  return roots.some((root) => isStrictChildPath(root, outputRoot));
};

const parseBundleProfile = (bytes: Uint8Array): BundleProfile => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Bundle is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Bundle must be a JSON object.');
  }
  const value = parsed as Record<string, unknown>;
  if (
    typeof value.document !== 'string'
    || typeof value.instructions !== 'string'
    || !Array.isArray(value.prompts)
    || value.prompts.length === 0
  ) {
    throw new Error('Bundle requires document, instructions, and a non-empty prompts array.');
  }
  return {
    documentBytes: new TextEncoder().encode(value.document).byteLength,
    instructionBytes: new TextEncoder().encode(value.instructions).byteLength,
    promptCount: value.prompts.length,
  };
};

const parseFlags = (
  flags: readonly string[],
): { repeats?: number; expectedAnswersPath?: string } => {
  const parsed: ParsedFlagOptions = {};
  const seen = new Set<string>();
  for (let index = 0; index < flags.length; index += 2) {
    addFlag(flags[index], flags[index + 1], seen, parsed);
  }
  return parsed;
};

export const parseOptions = (
  args: readonly string[],
  tempRoot: string,
  hostPlatform = platform(),
): BenchmarkOptions => {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    throw new Error(USAGE);
  }
  const [bundlePath, outputRoot, ...flags] = args;
  if (!bundlePath || !outputRoot || !path.isAbsolute(bundlePath) || !path.isAbsolute(outputRoot)) {
    throw new Error(USAGE);
  }
  if (!isOsTempChild(tempRoot, outputRoot, hostPlatform)) {
    throw new Error(
      `Output root must be inside the OS temporary directory (Bun temp root: ${tempRoot}).`,
    );
  }
  const { expectedAnswersPath, repeats } = parseFlags(flags);
  if (!Number.isSafeInteger(repeats) || (repeats ?? 0) < 3) {
    throw new Error('--repeats must be an integer of at least 3.');
  }
  return { bundlePath, expectedAnswersPath, outputRoot, repeats: repeats as number };
};

export const parseTimeMetrics = (text: string): TimeMetrics | null => {
  const elapsed = text.match(/([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys/);
  const resident = text.match(/([\d,]+)\s+maximum resident set size/);
  const footprint = text.match(/([\d,]+)\s+peak memory footprint/);
  if (!elapsed || !resident || !footprint) {
    return null;
  }
  const parseInteger = (value: string): number => Number(value.replaceAll(',', ''));
  const values = [
    Number(elapsed[1]) * 1000,
    Number(elapsed[2]) * 1000,
    Number(elapsed[3]) * 1000,
    parseInteger(resident[1] ?? ''),
    parseInteger(footprint[1] ?? ''),
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return null;
  }
  return {
    maximumResidentSetBytes: values[3] ?? 0,
    peakMemoryFootprintBytes: values[4] ?? 0,
    realMs: values[0] ?? 0,
    systemMs: values[2] ?? 0,
    userMs: values[1] ?? 0,
  };
};

const profileFromReader = (): ReaderProfile => ({
  maxNewTokens: MAX_NEW_TOKENS,
  modelId: MODEL_ID,
  modelRevision: MODEL_REVISION,
  readerVersion: READER_VERSION,
  runtimeBundleSha256: VENDORED_BUNDLE_SHA256,
  vendorArchivePath: path.resolve(ROOT, VENDORED_BUNDLE_PATH),
});

const resolvesUnderOsTemp = async (
  deps: BenchmarkDependencies,
  outputRoot: string,
): Promise<boolean> => {
  const roots = [deps.tempRoot, ...(deps.platform === 'darwin' ? ['/private/tmp', '/tmp'] : [])];
  const lexicalRoot = roots.find((root) => isStrictChildPath(root, outputRoot));
  if (!lexicalRoot) {
    return false;
  }
  let existingAncestor = path.resolve(outputRoot);
  while (!(await deps.exists(existingAncestor))) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) {
      return false;
    }
    existingAncestor = parent;
  }
  const [canonicalRoot, canonicalAncestor] = await Promise.all([
    deps.realpath(lexicalRoot),
    deps.realpath(existingAncestor),
  ]);
  const missingTail = path.relative(existingAncestor, path.resolve(outputRoot));
  return isStrictChildPath(canonicalRoot, path.resolve(canonicalAncestor, missingTail));
};

const READER_METRICS_PATTERN =
  /context\s+(\d+)\/(\d+) tokens; answered (\d+) probes from (\d+) queries; load ([\d.]+) s, warmup ([\d.]+) s, total ([\d.]+) s; last query first token ([\d.]+) s, total ([\d.]+) s; model revision ([\da-f]+); runtime bundle ([\da-f]+)/;

const answersForGroups = async (
  deps: BenchmarkDependencies,
  groups: readonly ReaderGroup[],
  repeat: number,
): Promise<{ answers: Uint8Array[]; failures: string[] }> => {
  const answers: Uint8Array[] = [];
  const failures: string[] = [];
  for (const group of groups) {
    for (const sample of group.samples) {
      if (sample.status !== 'measured') {
        failures.push(`${group.mode} repeat ${repeat} produced an incomplete process sample.`);
      } else {
        answers.push(await deps.readBytes(sample.answerPath));
      }
    }
  }
  return { answers, failures };
};

export const defaultDependencies = (
  spawnProcess: SpawnProcess,
  consoleWriter: ConsoleWriter,
): BenchmarkDependencies => ({
  architecture: arch(),
  bunVersion: Bun.version,
  cpuModel: cpus()[0]?.model ?? 'unavailable',
  exists: async (target) => {
    try {
      await access(target);
      return true;
    } catch {
      return false;
    }
  },
  hash: (content) => createHash('sha256').update(content).digest('hex'),
  mkdir: async (target) => {
    await mkdir(target, { recursive: true });
  },
  now: () => performance.now(),
  nowUtc: () => new Date().toISOString(),
  osRelease: release(),
  platform: platform(),
  readBytes: async (target) => new Uint8Array(await readFile(target)),
  realpath: resolveRealPath,
  runCommand: async (command, cwd) => {
    const processHandle = spawnProcess([...command], { cwd, stderr: 'pipe', stdout: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(processHandle.stdout).text(),
      new Response(processHandle.stderr).text(),
      processHandle.exited,
    ]);
    return { exitCode, stderr, stdout };
  },
  tempRoot: tmpdir(),
  uuid: randomUUID,
  writeBytes: async (target, content) => writeFile(target, content),
  writeLine: (stream, message) => {
    if (stream === 'stderr') {
      consoleWriter.error(message);
    } else {
      consoleWriter.log(message);
    }
  },
});

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const finalizeAnswerParity = (
  answers: readonly Uint8Array[],
  expectedBytes: Uint8Array | undefined,
  deps: BenchmarkDependencies,
  failures: readonly string[],
  initialStatus: BenchmarkReport['status'],
): {
  answerParity: BenchmarkReport['answerParity'];
  failureReasons: string[];
  status: BenchmarkReport['status'];
} => {
  const allByteIdentical =
    answers.length > 0
    && answers.every((answer) => equalBytes(answer, answers[0] ?? new Uint8Array()));
  const failureReasons = [...failures];
  let status = initialStatus;
  if (answers.length > 0 && !allByteIdentical) {
    failureReasons.push('Answer JSONL changed between the warmup and paired benchmark processes.');
    status = 'failed';
  }
  if (expectedBytes && answers.some((answer) => !equalBytes(answer, expectedBytes))) {
    failureReasons.push('At least one measured answer file differs from the supplied baseline.');
    status = 'failed';
  }
  return {
    answerParity: {
      allByteIdentical,
      expectedAnswersChecked: expectedBytes !== undefined,
      uniqueHashes: [...new Set(answers.map((answer) => deps.hash(answer)))],
    },
    failureReasons,
    status,
  };
};

const machineReady = (machine: MachineProfile): boolean =>
  machine.platform === 'darwin'
  && machine.macOSVersion !== null
  && machine.macOSVersion.trim().length > 0
  && machine.adapter !== null
  && machine.adapter.trim().length > 0
  && machine.metalSupport !== null
  && /^Metal\b/i.test(machine.metalSupport.trim())
  && !/unsupported|not supported/i.test(machine.metalSupport)
  && machine.probes.length === 2
  && machine.probes.every(({ exitCode }) => exitCode === 0);

const parseCliOptions = (
  args: readonly string[],
  deps: BenchmarkDependencies,
): BenchmarkOptions | undefined => {
  try {
    return parseOptions(args, deps.tempRoot);
  } catch (error) {
    deps.writeLine('stderr', error instanceof Error ? error.message : String(error));
    return undefined;
  }
};

export const parseDisplayProfile = (
  text: string,
): Pick<MachineProfile, 'adapter' | 'metalSupport'> => ({
  adapter: text.match(/^\s*Chipset Model:\s*(.+)$/m)?.[1]?.trim() ?? null,
  metalSupport: text.match(/^\s*Metal Support:\s*(.+)$/m)?.[1]?.trim() ?? null,
});

const machineProfileFor = async (deps: BenchmarkDependencies): Promise<MachineProfile> => {
  if (deps.platform !== 'darwin') {
    return {
      adapter: null,
      architecture: deps.architecture,
      bunVersion: deps.bunVersion,
      cpuModel: deps.cpuModel,
      macOSVersion: null,
      metalSupport: null,
      osRelease: deps.osRelease,
      platform: deps.platform,
      probes: [],
    };
  }
  const macOSCommand = ['sw_vers', '-productVersion'];
  const adapterCommand = ['/usr/sbin/system_profiler', 'SPDisplaysDataType'];
  const [macOS, display] = await Promise.all([
    deps.runCommand(macOSCommand, ROOT),
    deps.runCommand(adapterCommand, ROOT),
  ]);
  return {
    ...parseDisplayProfile(display.stdout),
    architecture: deps.architecture,
    bunVersion: deps.bunVersion,
    cpuModel: deps.cpuModel,
    macOSVersion: macOS.exitCode === 0 ? macOS.stdout.trim() : null,
    osRelease: deps.osRelease,
    platform: deps.platform,
    probes: [
      { command: macOSCommand, exitCode: macOS.exitCode },
      { command: adapterCommand, exitCode: display.exitCode },
    ],
  };
};

const prepareBenchmark = async (
  options: BenchmarkOptions,
  deps: BenchmarkDependencies,
  profile: ReaderProfile,
): Promise<PreparedBenchmark> => {
  if (!Number.isSafeInteger(options.repeats) || options.repeats < 3) {
    throw new Error('Benchmark requires at least three paired repetitions.');
  }
  if (!(await resolvesUnderOsTemp(deps, options.outputRoot))) {
    throw new Error(
      `Output root must resolve inside the OS temporary directory (Bun temp root: ${deps.tempRoot}).`,
    );
  }
  if ((await deps.exists(options.bundlePath)) === false) {
    throw new Error(`Bundle not found: ${options.bundlePath}`);
  }
  const runId = deps.uuid();
  const runDirectory = path.join(options.outputRoot, runId);
  if (await deps.exists(runDirectory)) {
    throw new Error(`Benchmark run directory already exists: ${runDirectory}`);
  }
  await deps.mkdir(runDirectory);
  const bundleBytes = await deps.readBytes(options.bundlePath);
  const bundle = {
    ...parseBundleProfile(bundleBytes),
    path: options.bundlePath,
    sha256: deps.hash(bundleBytes),
  };
  const vendorBytes = await deps.readBytes(profile.vendorArchivePath);
  const vendorArchiveSha256 = deps.hash(vendorBytes);
  const model = {
    ...profile,
    modelRevisionSha256: deps.hash(profile.modelRevision),
    vendorArchiveSha256,
  };
  const environment = await machineProfileFor(deps);
  const expectedBytes = options.expectedAnswersPath
    ? await deps.readBytes(options.expectedAnswersPath)
    : undefined;
  const failures: string[] = [];
  if (vendorArchiveSha256.length === 0) {
    failures.push('Vendor runtime archive hash is unavailable.');
  }
  if (machineReady(environment) === false) {
    failures.push('GPU host, macOS, or adapter identity is unavailable.');
  }
  return {
    bundle,
    environment,
    expectedBytes,
    failures,
    model,
    runDirectory,
    runId,
    status: failures.length > 0 ? 'blocked' : 'measured',
  };
};

const readerMetricsFromNumbers = (
  text: string,
  values: readonly number[],
  match: RegExpMatchArray,
): ReaderMetrics => {
  const [
    contextTokens = 0,
    contextCapacity = 0,
    answeredProbes = 0,
    queryCount = 0,
    loadSeconds = 0,
    warmupSeconds = 0,
    totalSeconds = 0,
    lastFirstTokenSeconds = 0,
    lastTotalSeconds = 0,
  ] = values;
  return {
    answeredProbes,
    contextCapacity,
    contextTokens,
    gpuReady: /^\[weak-reader\] GPU ready;/m.test(text),
    lastQueryFirstTokenMs: lastFirstTokenSeconds * 1000,
    lastQueryTotalMs: lastTotalSeconds * 1000,
    loadMs: loadSeconds * 1000,
    modelRevision: match[10] ?? '',
    queryCount,
    runtimeBundleSha256: match[11] ?? '',
    totalMs: totalSeconds * 1000,
    warmupMs: warmupSeconds * 1000,
  };
};

const validMetricValues = (values: readonly number[]): boolean =>
  values.every((value) => Number.isFinite(value) && value >= 0);

export const parseReaderMetrics = (text: string): ReaderMetrics | null => {
  const match = text.match(READER_METRICS_PATTERN);
  if (!match) {
    return null;
  }
  const values = match.slice(1, 10).map(Number);
  if (!validMetricValues(values)) {
    return null;
  }
  return readerMetricsFromNumbers(text, values, match);
};

const runProcess = async (
  deps: BenchmarkDependencies,
  profile: ReaderProfile,
  options: BenchmarkOptions,
  runDirectory: string,
  label: string,
  expectedPromptCount: number,
): Promise<ReaderSample> => {
  const folder = path.join(runDirectory, label);
  const answerPath = path.join(folder, 'answers.jsonl');
  const stdoutPath = path.join(folder, 'stdout.txt');
  const stderrPath = path.join(folder, 'stderr.txt');
  await deps.mkdir(folder);
  const command = [
    TIME_COMMAND,
    '-l',
    process.execPath,
    READER_PATH,
    options.bundlePath,
    answerPath,
  ];
  const started = deps.now();
  const result = await deps.runCommand(command, ROOT);
  const wallMs = Math.max(0, deps.now() - started);
  const stdoutPathBytes = result.stdout;
  const stderrPathBytes = result.stderr;
  await deps.writeBytes(stdoutPath, stdoutPathBytes);
  await deps.writeBytes(stderrPath, stderrPathBytes);
  const time = parseTimeMetrics(result.stderr);
  const reader = parseReaderMetrics(`${result.stdout}\n${result.stderr}`);
  let answer: Uint8Array | undefined;
  if (await deps.exists(answerPath)) {
    answer = await deps.readBytes(answerPath);
  }
  const answerText = answer ? new TextDecoder().decode(answer) : '';
  const answerLines = answerText.length === 0 ? [] : answerText.split(/\r?\n/);
  if (answerLines.at(-1) === '') {
    answerLines.pop();
  }
  const answerLineCount = answerLines.length;
  const status =
    result.exitCode === 0
    && time !== null
    && reader !== null
    && answer !== undefined
    && answer.byteLength > 0
    && answerLineCount === expectedPromptCount
    && answerLines.every((line) => line.trim().length > 0)
    && reader.answeredProbes === expectedPromptCount
    && reader.gpuReady
    && reader.modelRevision === profile.modelRevision
    && reader.runtimeBundleSha256 === profile.runtimeBundleSha256
      ? 'measured'
      : 'failed';
  return {
    answerBytes: answer?.byteLength,
    answerPath,
    answerSha256: answer ? deps.hash(answer) : undefined,
    command,
    exitCode: result.exitCode,
    reader: reader ?? undefined,
    status,
    stderrPath,
    stdoutPath,
    time: time ?? undefined,
    wallMs,
  };
};

const runGroup = async (
  deps: BenchmarkDependencies,
  profile: ReaderProfile,
  options: BenchmarkOptions,
  runDirectory: string,
  pairIndex: number,
  mode: ReaderGroup['mode'],
  expectedPromptCount: number,
): Promise<ReaderGroup> => {
  const started = deps.now();
  const work = Array.from(
    { length: WORKERS_PER_GROUP },
    (_, index) => () =>
      runProcess(
        deps,
        profile,
        options,
        runDirectory,
        `pair-${pairIndex}-${mode}-worker-${index + 1}`,
        expectedPromptCount,
      ),
  );
  const samples: ReaderSample[] = [];
  if (mode === 'serial-2') {
    for (const run of work) {
      samples.push(await run());
    }
  } else {
    samples.push(...(await Promise.all(work.map((run) => run()))));
  }
  return { mode, samples, wallMs: Math.max(0, deps.now() - started) };
};

const pairedGroupsForRepeat = async (
  deps: BenchmarkDependencies,
  profile: ReaderProfile,
  options: BenchmarkOptions,
  runDirectory: string,
  repeat: number,
  promptCount: number,
): Promise<{ firstMode: ReaderGroup['mode']; groups: ReaderGroup[] }> => {
  const firstMode: ReaderGroup['mode'] = repeat % 2 === 1 ? 'serial-2' : 'parallel-2';
  const secondMode = firstMode === 'serial-2' ? 'parallel-2' : 'serial-2';
  const first = await runGroup(
    deps,
    profile,
    options,
    runDirectory,
    repeat,
    firstMode,
    promptCount,
  );
  const second = await runGroup(
    deps,
    profile,
    options,
    runDirectory,
    repeat,
    secondMode,
    promptCount,
  );
  return { firstMode, groups: [first, second] };
};

const pairedBenchmark = async (
  options: BenchmarkOptions,
  deps: BenchmarkDependencies,
  profile: ReaderProfile,
  prepared: PreparedBenchmark,
  warmup: BenchmarkSamples,
): Promise<BenchmarkSamples> => {
  const answers = [...warmup.answers];
  const failures = [...warmup.failures];
  const pairs: Array<BenchmarkReport['pairs'][number]> = [];
  let status: BenchmarkReport['status'] = 'measured';
  for (let repeat = 1; repeat <= options.repeats; repeat += 1) {
    const { firstMode, groups } = await pairedGroupsForRepeat(
      deps,
      profile,
      options,
      prepared.runDirectory,
      repeat,
      prepared.bundle.promptCount,
    );
    const groupAnswers = await answersForGroups(deps, groups, repeat);
    answers.push(...groupAnswers.answers);
    failures.push(...groupAnswers.failures);
    if (groupAnswers.failures.length > 0) {
      status = 'failed';
    }
    const serial2 = groups.find((group) => group.mode === 'serial-2');
    const parallel2 = groups.find((group) => group.mode === 'parallel-2');
    if (serial2 && parallel2) {
      pairs.push({
        firstMode,
        parallel2,
        parallelToSerialSpeedup: parallel2.wallMs > 0 ? serial2.wallMs / parallel2.wallMs : null,
        repeat,
        serial2,
      });
    }
  }
  return { answers, failures, pairs, status, warmup: warmup.warmup };
};

const warmupBenchmark = async (
  options: BenchmarkOptions,
  deps: BenchmarkDependencies,
  profile: ReaderProfile,
  prepared: PreparedBenchmark,
): Promise<BenchmarkSamples> => {
  const warmup = await runProcess(
    deps,
    profile,
    options,
    prepared.runDirectory,
    'warmup',
    prepared.bundle.promptCount,
  );
  if (warmup.status !== 'measured') {
    return {
      answers: [],
      failures: [
        'Warm-cache run did not produce GPU-ready output, one answer per prompt, and complete /usr/bin/time metrics.',
      ],
      pairs: [],
      status: 'failed',
      warmup,
    };
  }

  const answer = await deps.readBytes(warmup.answerPath);
  if (prepared.expectedBytes && !equalBytes(answer, prepared.expectedBytes)) {
    return {
      answers: [answer],
      failures: ['Warmup answers differ byte-for-byte from the supplied baseline.'],
      pairs: [],
      status: 'failed',
      warmup,
    };
  }
  return { answers: [answer], failures: [], pairs: [], status: 'measured', warmup };
};

const measureBenchmark = async (
  options: BenchmarkOptions,
  deps: BenchmarkDependencies,
  profile: ReaderProfile,
  prepared: PreparedBenchmark,
): Promise<BenchmarkSamples> => {
  if (prepared.status !== 'measured') {
    return {
      answers: [],
      failures: [],
      pairs: [],
      status: 'blocked',
    };
  }
  const warmup = await warmupBenchmark(options, deps, profile, prepared);
  if (warmup.status !== 'measured') {
    return warmup;
  }
  return pairedBenchmark(options, deps, profile, prepared, warmup);
};

export const runBenchmark = async (
  options: BenchmarkOptions,
  deps: BenchmarkDependencies,
  profile: ReaderProfile = profileFromReader(),
): Promise<BenchmarkReport> => {
  const prepared = await prepareBenchmark(options, deps, profile);
  const samples = await measureBenchmark(options, deps, profile, prepared);
  const parity = finalizeAnswerParity(
    samples.answers,
    prepared.expectedBytes,
    deps,
    [...prepared.failures, ...samples.failures],
    samples.status,
  );
  const report: BenchmarkReport = {
    answerParity: parity.answerParity,
    bundle: prepared.bundle,
    environment: prepared.environment,
    failureReasons: parity.failureReasons,
    generatedAtUtc: deps.nowUtc(),
    model: prepared.model,
    pairs: samples.pairs,
    runDirectory: prepared.runDirectory,
    runId: prepared.runId,
    schemaVersion: 1,
    status: parity.status,
    warmup: samples.warmup,
  };
  await deps.writeBytes(
    path.join(prepared.runDirectory, 'measurement.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
};

const writeCliReport = (report: BenchmarkReport, deps: BenchmarkDependencies): number => {
  deps.writeLine(
    'stdout',
    `${report.status}: ${path.join(report.runDirectory, 'measurement.json')}`,
  );
  if (report.failureReasons.length > 0) {
    deps.writeLine('stderr', report.failureReasons.join('\n'));
  }
  return report.status === 'measured' ? 0 : 1;
};

const executeCliBenchmark = async (
  options: BenchmarkOptions,
  deps: BenchmarkDependencies,
): Promise<number> => {
  try {
    const report = await runBenchmark(options, deps);
    return writeCliReport(report, deps);
  } catch (error) {
    deps.writeLine('stderr', error instanceof Error ? error.message : String(error));
    return 1;
  }
};

export const runCli = async (
  args: readonly string[],
  deps: BenchmarkDependencies,
): Promise<number> => {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    deps.writeLine('stdout', USAGE);
    return 0;
  }
  const options = parseCliOptions(args, deps);
  return options ? executeCliBenchmark(options, deps) : 2;
};

export const runMain = (
  isMain: boolean,
  args: readonly string[],
  deps: BenchmarkDependencies,
): Promise<number | undefined> => (isMain ? runCli(args, deps) : Promise.resolve(undefined));

void runMain(
  import.meta.main,
  Bun.argv.slice(2),
  defaultDependencies(Bun.spawn as SpawnProcess, {
    error: console.error,
    log: console.log,
  }),
);
