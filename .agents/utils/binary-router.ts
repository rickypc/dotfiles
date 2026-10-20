import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
  type BinaryKind,
  type BinaryRouteContext,
  binaryInstallTimeoutMs,
  routeStagesFor,
} from './binary-routes.js';

import type { CommandSpec } from './contracts.js';
import { type FileSystem, nodeFileSystem } from './filesystem.js';
import type { CommandExecutor } from './process.js';
import { commandText, type SearchAttempt, stagedRgSearch } from './search-fallback.js';

export type { BinaryKind } from './binary-routes.js';

export interface BinaryGateResult {
  readonly attempts: readonly SearchAttempt[];
  readonly found: boolean;
  readonly output: string;
}

/** Reads the first `bytes` bytes of `path` as a latin1 string; '' when unreadable. */
export type BinaryHeadReader = (path: string, bytes: number) => Promise<string>;

export interface BinaryProbe {
  readonly attempts: readonly SearchAttempt[];
  readonly detail: string;
  readonly kind: BinaryKind;
}

export interface BinaryRouteResult {
  readonly attempts: readonly SearchAttempt[];
  readonly found: boolean;
  readonly kind: BinaryKind;
  readonly output: string;
}

export type BinaryRouteRow = (typeof binaryRouteRows)[number];

export type BinaryTargetShape =
  | { readonly shape: 'file' }
  | { readonly shape: 'process' }
  | { readonly shape: 'process-pid' }
  | { readonly shape: 'url' };

interface BinaryTool {
  readonly installArgs: readonly string[];
  readonly installCommand: string;
  /** Resolve a keg-only executable through `brew --prefix <formula>` when installed. */
  readonly kegPrefixFormula?: string;
  readonly kegRelativePath?: string;
  readonly probe: string;
  readonly probeShell?: string;
  readonly toolInstallKind: ToolInstallKind;
}

interface ResolvedTool {
  readonly executable: string;
  readonly tool: BinaryTool;
}

type ToolInstallKind = 'brew-formula' | 'brew-cask' | 'dotnet-tool' | 'pip';

/** The eighteen route rows the binary router owns; mirrored in references/binary-router.md. */
export const binaryRouteRows = [
  'electron-asar',
  'web-bundle',
  'hermes-bytenode',
  'mach-o',
  'native-logic',
  'elf-pe',
  'go',
  'rust',
  'dotnet',
  'apk',
  'flutter',
  'wasm',
  'sqlite',
  'plist-nib-car',
  'pcap-har',
  'firmware',
  'website',
  'running-app',
] as const;

const attemptOutputCap = 20_000;
const binaryCandidatesCap = 20;
const headBytes = 4096;
const flutterHeadBytes = 65_536;

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export const defaultBinaryHeadReader: BinaryHeadReader = async (path, bytes) => {
  try {
    const buffer = Buffer.from(await Bun.file(path).slice(0, bytes).arrayBuffer());
    return buffer.toString('latin1');
  } catch {
    return '';
  }
};

/** The Flutter row: the 32 hex chars at magic+20 are the Dart snapshot hash. */
export const flutterSnapshotHash = (head: string): string | undefined => {
  const magic = [0xf5, 0xf5, 0xdc, 0xdc].map((byte) => String.fromCharCode(byte)).join('');
  const index = head.indexOf(magic);
  if (index < 0 || index + 52 > head.length) {
    return undefined;
  }
  return head.slice(index + 20, index + 52);
};

const isValidUtf8 = (head: string): boolean => {
  try {
    utf8Decoder.decode(Buffer.from(head, 'latin1'));
    return true;
  } catch {
    return false;
  }
};

/** A located candidate is binary when a NUL byte or invalid UTF-8 appears in its head. */
export const isBinaryContent = (head: string): boolean =>
  head.includes('\u0000') || !isValidUtf8(head);

const readUInt32LE = (head: string): number =>
  head.charCodeAt(0)
  | (head.charCodeAt(1) << 8)
  | (head.charCodeAt(2) << 16)
  | (head.charCodeAt(3) << 24);

const startsWithBytes = (head: string, bytes: readonly number[]): boolean =>
  bytes.every((byte, index) => head.charCodeAt(index) === byte);

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the ordered magic-family chain keeps every content detection signature explicit.
const classifyHead = (head: string): BinaryKind | undefined => {
  if (
    startsWithBytes(head, [0xcf, 0xfa, 0xed, 0xfe])
    || startsWithBytes(head, [0xce, 0xfa, 0xed, 0xfe])
    || startsWithBytes(head, [0xfe, 0xed, 0xfa, 0xcf])
    || startsWithBytes(head, [0xfe, 0xed, 0xfa, 0xce])
  ) {
    return 'mach-o';
  }
  if (
    startsWithBytes(head, [0xca, 0xfe, 0xba, 0xbe])
    || startsWithBytes(head, [0xbe, 0xba, 0xfe, 0xca])
  ) {
    return 'fat';
  }
  if (startsWithBytes(head, [0x7f, 0x45, 0x4c, 0x46])) {
    return 'elf';
  }
  if (head.startsWith('MZ')) {
    return 'pe';
  }
  if (startsWithBytes(head, [0x00, 0x61, 0x73, 0x6d])) {
    return 'wasm';
  }
  if (head.startsWith('SQLite format 3\u0000')) {
    return 'sqlite';
  }
  if (head.startsWith('bplist00')) {
    return 'plist';
  }
  if (startsWithBytes(head, [0xc6, 0x1f, 0xbc, 0x03])) {
    return 'hermes';
  }
  if (
    startsWithBytes(head, [0xd4, 0xc3, 0xb2, 0xa1])
    || startsWithBytes(head, [0xa1, 0xb2, 0xc3, 0xd4])
    || startsWithBytes(head, [0x0a, 0x0d, 0x0d, 0x0a])
  ) {
    return 'pcap';
  }
  if (
    startsWithBytes(head, [0x1f, 0x8b])
    || head.startsWith('070701')
    || head.startsWith('070707')
    || startsWithBytes(head, [0x27, 0x05, 0x19, 0x56])
  ) {
    return 'firmware';
  }
  if (
    head.startsWith('PK\u0003\u0004')
    || head.startsWith('PK\u0005\u0006')
    || head.startsWith('PK\u0007\u0008')
  ) {
    return 'zip';
  }
  if (readUInt32LE(head) < 0x1000 && head.slice(8, 64).includes('{"files"')) {
    return 'asar';
  }
  return undefined;
};

const fileKindKeywords: ReadonlyArray<readonly [RegExp, BinaryKind]> = [
  [/Mach-O/u, 'mach-o'],
  [/\.Net|Mono/u, 'dotnet'],
  [/ELF/u, 'elf'],
  [/PE32|MS Windows/u, 'pe'],
  [/SQLite/u, 'sqlite'],
  [/WebAssembly/u, 'wasm'],
  [/PCAP/iu, 'pcap'],
  [/Apple [Bb]inary [Pp]roperty [Ll]ist/u, 'plist'],
  [/Zip [Aa]rchive/u, 'zip'],
];

const brewInstallTool = (probe: string, formula: string, cask = false): BinaryTool => ({
  installArgs: ['install', cask ? '--cask' : '--formula', formula],
  installCommand: 'brew',
  probe,
  toolInstallKind: cask ? 'brew-cask' : 'brew-formula',
});

const capOutput = (text: string): string =>
  text.length > attemptOutputCap
    ? `${text.slice(0, attemptOutputCap)}\n...truncated ${text.length - attemptOutputCap} chars`
    : text;

const kegBrewTool = (probe: string, formula: string, kegRelativePath: string): BinaryTool => ({
  ...brewInstallTool(probe, formula),
  kegPrefixFormula: formula,
  kegRelativePath,
});

const outputFor = (stdout: string, stderr: string): string =>
  [stdout, stderr].filter(Boolean).join('\n').trim();

const attemptFor = async (
  executor: CommandExecutor,
  strategy: string,
  spec: CommandSpec,
): Promise<{ readonly attempt: SearchAttempt; readonly output: string }> => {
  try {
    const result = await executor(spec);
    const output = result.stdout.trim();
    return {
      attempt: {
        command: commandText(spec),
        detail: capOutput(outputFor(result.stdout, result.stderr) || `Exit code ${result.code}.`),
        status:
          result.code === 0
            ? output
              ? 'found'
              : 'not-found'
            : result.code === 1
              ? 'not-found'
              : 'error',
        strategy,
      },
      output,
    };
  } catch (error) {
    return {
      attempt: {
        command: commandText(spec),
        detail: error instanceof Error ? error.message : String(error),
        status: 'error',
        strategy,
      },
      output: '',
    };
  }
};

/** Corroborates an unclassified binary with `file`, never with the extension alone. */
export const probeBinaryKind = async (
  executor: CommandExecutor,
  headReader: BinaryHeadReader,
  path: string,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the classification ladder keeps magic, flutter, and file(1) corroboration steps explicit.
): Promise<BinaryProbe | undefined> => {
  const head = await headReader(path, headBytes);
  if (!head || !isBinaryContent(head)) {
    return undefined;
  }
  const basename = path.slice(path.lastIndexOf('/') + 1);
  const kind = classifyHead(head);
  if (kind && kind !== 'fat') {
    const flutter =
      kind === 'elf' && basename === 'libapp.so'
        ? flutterSnapshotHash(await headReader(path, flutterHeadBytes))
        : undefined;
    return {
      attempts: [],
      detail: flutter
        ? `magic bytes: ${kind}; flutter snapshot hash ${flutter}`
        : `magic bytes: ${kind}`,
      kind,
    };
  }
  const mime = await attemptFor(executor, 'binary-gate:mime', {
    args: ['-b', '--mime-type', path],
    command: 'file',
  });
  const human = await attemptFor(executor, 'binary-gate:file', {
    args: ['-b', path],
    command: 'file',
  });
  const described = human.output || mime.output;
  const keywordKind = fileKindKeywords.find(([pattern]) => pattern.test(described))?.[1];
  if (keywordKind) {
    return {
      attempts: [mime.attempt, human.attempt],
      detail: `file(1): ${described}`,
      kind: keywordKind,
    };
  }
  return {
    attempts: [mime.attempt, human.attempt],
    detail: described ? `unclassified binary; file(1): ${described}` : 'unclassified binary',
    kind: 'generic-binary',
  };
};

const binaryTools: Readonly<Record<string, BinaryTool>> = {
  adb: brewInstallTool('adb', 'android-platform-tools'),
  apktool: brewInstallTool('apktool', 'apktool'),
  binwalk: brewInstallTool('binwalk', 'binwalk'),
  checksec: brewInstallTool('checksec', 'checksec'),
  dotnet: brewInstallTool('dotnet', 'dotnet-sdk', true),
  ghidra: kegBrewTool('analyzeHeadless', 'ghidra', 'libexec/support/analyzeHeadless'),
  'ilspycmd -p': {
    installArgs: ['tool', 'install', '-g', 'ilspycmd'],
    installCommand: 'dotnet',
    probe: 'ilspycmd',
    probeShell:
      'command -v ilspycmd || { test -x "$HOME/.dotnet/tools/ilspycmd" '
      + '&& echo "$HOME/.dotnet/tools/ilspycmd"; }',
    toolInstallKind: 'dotnet-tool',
  },
  jadx: brewInstallTool('jadx', 'jadx'),
  'llvm-nm': kegBrewTool('llvm-nm', 'llvm', 'bin/llvm-nm'),
  'llvm-objdump': kegBrewTool('llvm-objdump', 'llvm', 'bin/llvm-objdump'),
  'llvm-readelf': kegBrewTool('llvm-readelf', 'llvm', 'bin/llvm-readelf'),
  prettier: brewInstallTool('prettier', 'prettier'),
  radare2: brewInstallTool('r2', 'radare2'),
  'tshark-wireshark': {
    installArgs: ['install', '--formula', 'wireshark'],
    installCommand: 'brew',
    probe: 'tshark',
    toolInstallKind: 'brew-formula',
  },
  unblob: {
    installArgs: ['-m', 'pip', 'install', 'unblob'],
    installCommand: 'python3',
    probe: 'unblob',
    toolInstallKind: 'pip',
  },
  'wasm-objdump': brewInstallTool('wasm-objdump', 'wabt'),
  wasm2wat: brewInstallTool('wasm2wat', 'wabt'),
  wrestool: brewInstallTool('wrestool', 'icoutils'),
};

const extractionDirectoryFor = (target: string): string => {
  const slug = createHash('sha256').update(target).digest('hex').slice(0, 12);
  return `${tmpdir()}/repo-search-binary/${target.slice(target.lastIndexOf('/') + 1)}-${slug}`;
};

// Only WAL-mode sqlite carries sidecars today; every other kind resolves to [].
const COMPANION_SUFFIXES: readonly string[] = ['-shm', '-wal'];

const companionsFor = async (fileSystem: FileSystem, target: string): Promise<string[]> => {
  const companions: string[] = [];
  for (const suffix of COMPANION_SUFFIXES) {
    if (await fileSystem.exists(`${target}${suffix}`)) {
      companions.push(`${target}${suffix}`);
    }
  }
  return companions;
};

const installSpec = (tool: BinaryTool): CommandSpec => ({
  args: tool.installArgs,
  command: tool.installCommand,
  environment: tool.toolInstallKind === 'dotnet-tool' ? undefined : { HOMEBREW_NO_ENV_HINTS: '1' },
  timeoutMs: binaryInstallTimeoutMs,
});

const kegProbeSpec = (tool: BinaryTool): CommandSpec => ({
  args: ['--prefix', tool.kegPrefixFormula ?? ''],
  command: 'brew',
});

const queryAnsweredBy = (output: string, query: string): boolean => {
  const normalized = query.trim().toLowerCase();
  return normalized.length > 0 && output.toLowerCase().includes(normalized);
};

const toolProbeSpec = (tool: BinaryTool): CommandSpec => ({
  args: ['-c', tool.probeShell ?? `command -v ${tool.probe}`],
  command: 'sh',
});

export const ensureBinaryTool = async (
  executor: CommandExecutor,
  name: string,
): Promise<{ readonly attempts: readonly SearchAttempt[]; readonly resolved?: ResolvedTool }> => {
  const tool = binaryTools[name];
  if (!tool) {
    return { attempts: [] };
  }
  const attempts: SearchAttempt[] = [];
  const resolveExecutable = async (): Promise<string | undefined> => {
    const checking = await attemptFor(
      executor,
      `binary-tool-check:${name}`,
      tool.kegPrefixFormula ? kegProbeSpec(tool) : toolProbeSpec(tool),
    );
    attempts.push(checking.attempt);
    return checking.attempt.status === 'found' && checking.output.trim()
      ? checking.output.trim() + (tool.kegPrefixFormula ? `/${tool.kegRelativePath}` : '')
      : undefined;
  };
  const executable = await resolveExecutable();
  if (executable) {
    return { attempts, resolved: { executable, tool } };
  }
  const install = await attemptFor(executor, `binary-tool-install:${name}`, installSpec(tool));
  attempts.push(install.attempt);
  if (install.attempt.status !== 'found' && install.attempt.status !== 'not-found') {
    return { attempts };
  }
  const rechecked = await resolveExecutable();
  if (rechecked === undefined) {
    return { attempts };
  }
  return { attempts, resolved: { executable: rechecked, tool } };
};

/** Rows whose stages materialize an extraction tree that is text-searched afterwards. */
const extractionKinds: ReadonlySet<BinaryKind> = new Set(['asar', 'dotnet', 'firmware', 'zip']);

export const binaryTargetShape = (target: string): BinaryTargetShape => {
  if (target.startsWith('http://') || target.startsWith('https://')) {
    return { shape: 'url' };
  }
  if (/^\d+$/u.test(target)) {
    return { shape: 'process-pid' };
  }
  if (target.startsWith('/')) {
    return { shape: 'file' };
  }
  return { shape: 'process' };
};

const containsPath = (parent: string, child: string): boolean =>
  child === parent || child.startsWith(`${parent}/`);

const hasBundleShape = (head: string): boolean =>
  // biome-ignore lint/security/noSecrets: deterministic test or regex fixture content, not a credential
  head.includes('sourceMappingURL=') || head.split('\n').some((line) => line.length > 500);

export const runBinaryRoute = async (
  executor: CommandExecutor,
  options: {
    readonly deep: boolean;
    readonly fileSystem?: FileSystem;
    readonly kind: BinaryKind;
    readonly query: string;
    readonly target: string;
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the ordered route runner keeps every ensure, stage, skip, and extraction transition explicit.
): Promise<BinaryRouteResult> => {
  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const extractionDirectory = extractionDirectoryFor(options.target);
  const attempts: SearchAttempt[] = [];
  const resolvedTools = new Map<string, string>();
  const runnableStages = routeStagesFor(options.kind).filter(
    (stage) => !stage.deep || options.deep,
  );
  const requires = [
    ...new Set(runnableStages.flatMap((stage) => (stage.requires ? [stage.requires] : []))),
  ];
  for (const name of requires) {
    const ensured = await ensureBinaryTool(executor, name);
    attempts.push(...ensured.attempts);
    if (ensured.resolved) {
      resolvedTools.set(name, ensured.resolved.executable);
    }
  }
  let found = false;
  let output = '';
  const extractionRequired = extractionKinds.has(options.kind);
  await fileSystem.mkdir(extractionDirectory, { recursive: true });
  const companions = await companionsFor(fileSystem, options.target);
  for (const stage of runnableStages) {
    if (stage.deep && !options.deep) {
      continue;
    }
    if (stage.requires && !resolvedTools.has(stage.requires)) {
      attempts.push({
        command: stage.strategy,
        detail: `Skipped: routed tool ${stage.requires} is unavailable after its install stage.`,
        status: 'skipped',
        strategy: stage.strategy,
      });
      continue;
    }
    const context: BinaryRouteContext = {
      companions,
      executableFor: (name) => resolvedTools.get(name) ?? name,
      extractionDirectory,
      target: options.target,
    };
    const executed = await attemptFor(executor, stage.strategy, stage.spec(context));
    attempts.push(executed.attempt);
    if (executed.attempt.status === 'found') {
      found = true;
      output = output ? `${output}\n${executed.output}` : executed.output;
    }
    if (queryAnsweredBy(executed.output, options.query)) {
      break;
    }
  }
  // Extraction stages routinely succeed silently (empty stdout, notes on stderr),
  // so the staged extraction search is the row's answering stage: run it for
  // every extraction kind and let it report honestly when nothing was produced.
  if (extractionRequired) {
    const extraction = await stagedRgSearch(
      executor,
      extractionDirectory,
      options.query.trim() || options.target.slice(options.target.lastIndexOf('/') + 1),
    );
    attempts.push(...extraction.attempts);
    if (extraction.found) {
      found = true;
      output = output ? `${output}\n${extraction.output}` : extraction.output;
    }
  }
  return { attempts, found, kind: options.kind, output: capOutput(output) };
};

/** Classify every located binary; decode only as the query requires. */
export const runBinaryGate = async (
  executor: CommandExecutor,
  options: {
    readonly candidates: readonly string[];
    readonly deep?: boolean;
    readonly headReader?: BinaryHeadReader;
    readonly query: string;
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the ordered gate loop keeps classification, routing, and answer-break transitions explicit.
): Promise<BinaryGateResult> => {
  const headReader = options.headReader ?? defaultBinaryHeadReader;
  const attempts: SearchAttempt[] = [];
  let found = false;
  let output = '';
  for (const candidate of options.candidates.slice(0, binaryCandidatesCap)) {
    const probe = await probeBinaryKind(executor, headReader, candidate);
    if (!probe) {
      continue;
    }
    attempts.push({
      command: `probe ${candidate}`,
      detail: probe.detail,
      status: 'found',
      strategy: 'binary-gate:classify',
    });
    attempts.push(...probe.attempts);
    const route = await runBinaryRoute(executor, {
      deep: options.deep ?? !queryAnsweredBy(probe.detail, options.query),
      kind: probe.kind,
      query: options.query,
      target: candidate,
    });
    attempts.push(...route.attempts);
    if (route.found) {
      found = true;
      output = output ? `${output}\n${route.output}` : route.output;
    }
    if (queryAnsweredBy(route.output, options.query)) {
      break;
    }
  }
  return { attempts, found, output: capOutput(output) };
};

const scriptSourcePattern = /(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/gu;

/** The running-app row: bounded, non-interactive process evidence only. */
const runProcessRoute = async (
  executor: CommandExecutor,
  target: string,
): Promise<BinaryGateResult> => {
  const attempts: SearchAttempt[] = [];
  let pid = target;
  if (!/^\d+$/u.test(target)) {
    const pgrep = await attemptFor(executor, 'binary-route:running-app:pgrep', {
      args: ['-x', target],
      command: 'pgrep',
    });
    attempts.push(pgrep.attempt);
    pid = pgrep.output.split('\n')[0] ?? '';
  }
  if (!/^\d+$/u.test(pid)) {
    return {
      attempts,
      found: false,
      output: `No running process matches the explicitly provided target: ${target}`,
    };
  }
  const context = await attemptFor(executor, 'binary-route:running-app:process', {
    args: ['-p', pid, '-o', 'pid,ppid,comm,args'],
    command: 'ps',
  });
  attempts.push(context.attempt);
  const logs = await attemptFor(executor, 'binary-route:running-app:logs', {
    args: ['show', '--last', '15m', '--predicate', `processID == ${pid}`],
    command: 'log',
    timeoutMs: 10 * 60 * 1000,
  });
  attempts.push(logs.attempt);
  return {
    attempts,
    found: context.attempt.status === 'found' || logs.attempt.status === 'found',
    output: capOutput([context.output, logs.output].filter(Boolean).join('\n')),
  };
};

/** The website row: fetch the explicit URL, then its script sources, both capped. */
const runWebsiteRoute = async (
  executor: CommandExecutor,
  url: string,
  query: string,
): Promise<BinaryGateResult> => {
  const attempts: SearchAttempt[] = [];
  const page = await attemptFor(executor, 'binary-route:website:fetch', {
    args: ['-fsSL', '--max-time', '30', url],
    command: 'curl',
  });
  attempts.push(page.attempt);
  let found = page.attempt.status === 'found';
  let output = page.output;
  const sources = [...page.output.matchAll(scriptSourcePattern)]
    .map((match) => match[1] ?? '')
    .filter(Boolean)
    .slice(0, 5);
  for (const source of sources) {
    const fetched = await attemptFor(executor, 'binary-route:website:script', {
      args: ['-fsSL', '--max-time', '30', source],
      command: 'curl',
    });
    attempts.push(fetched.attempt);
    if (fetched.attempt.status === 'found') {
      found = true;
      output = output ? `${output}\n${fetched.output}` : fetched.output;
    }
    if (queryAnsweredBy(fetched.output, query)) {
      return { attempts, found, output: capOutput(output) };
    }
  }
  return { attempts, found, output: capOutput(output) };
};

export const runExplicitBinaryTarget = async (
  executor: CommandExecutor,
  options: {
    readonly headReader?: BinaryHeadReader;
    readonly root: string;
    readonly target: string;
    readonly queries: readonly string[];
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the explicit-target dispatch keeps every shape boundary and failure receipt explicit.
): Promise<BinaryGateResult & { readonly source: 'binary' }> => {
  const headReader = options.headReader ?? defaultBinaryHeadReader;
  const query = options.queries.filter((value) => value.trim()).join(' ');
  const shape = binaryTargetShape(options.target);
  if (shape.shape === 'url') {
    return { ...(await runWebsiteRoute(executor, options.target, query)), source: 'binary' };
  }
  if (shape.shape === 'process' || shape.shape === 'process-pid') {
    return { ...(await runProcessRoute(executor, options.target)), source: 'binary' };
  }
  const target = options.target.replace(/\/+$/u, '');
  const root = options.root.replace(/\/+$/u, '');
  if (!containsPath(root, target)) {
    throw new Error(`binary target is outside the approved root: ${target} is not under ${root}`);
  }
  const head = await headReader(target, headBytes);
  if (!head) {
    return {
      attempts: [
        {
          command: `head -c ${headBytes} ${target}`,
          detail: 'The explicitly provided target could not be read.',
          status: 'error',
          strategy: 'binary-gate:classify',
        },
      ],
      found: false,
      output: '',
      source: 'binary',
    };
  }
  if (!isBinaryContent(head)) {
    if (!hasBundleShape(head)) {
      return {
        attempts: [
          {
            command: `head -c ${headBytes} ${target}`,
            detail: 'The explicitly provided target is a text file with no bundle shape.',
            status: 'skipped',
            strategy: 'binary-gate:classify',
          },
        ],
        found: false,
        output: '',
        source: 'binary',
      };
    }
    const route = await runBinaryRoute(executor, {
      deep: true,
      kind: 'text-bundle',
      query,
      target,
    });
    return { attempts: route.attempts, found: route.found, output: route.output, source: 'binary' };
  }
  const probe = await probeBinaryKind(executor, headReader, target);
  const route = await runBinaryRoute(executor, {
    deep: true,
    kind: probe?.kind ?? 'generic-binary',
    query,
    target,
  });
  return {
    attempts: [
      {
        command: `probe ${target}`,
        detail: probe?.detail ?? 'unclassified binary',
        status: 'found',
        strategy: 'binary-gate:classify',
      },
      ...(probe?.attempts ?? []),
      ...route.attempts,
    ],
    found: route.found,
    output: route.output,
    source: 'binary',
  };
};
