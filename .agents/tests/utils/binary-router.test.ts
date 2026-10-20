import { expect, mock, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

import {
  type BinaryHeadReader,
  type BinaryKind,
  binaryRouteRows,
  binaryTargetShape,
  defaultBinaryHeadReader,
  ensureBinaryTool,
  flutterSnapshotHash,
  isBinaryContent,
  probeBinaryKind,
  runBinaryGate,
  runBinaryRoute,
  runExplicitBinaryTarget,
} from '../../utils/binary-router.js';
import type { CommandResult, CommandSpec } from '../../utils/contracts.js';
import type { FileSystem } from '../../utils/filesystem.js';
import type { CommandExecutor } from '../../utils/process.js';

// The SUT consumes these built-ins directly. Each registered module mock re-exports the
// real platform value, so the SUT keeps real behavior while the module boundary is
// explicit and future same-process imports stay uncontaminated.
mock.module('node:buffer', () => ({ Buffer }));
mock.module('node:crypto', () => ({ createHash }));
mock.module('node:os', () => ({ tmpdir }));

const bytes = (values: readonly number[]): string =>
  values.map((value) => String.fromCharCode(value)).join('');

const fail = (code = 1, stdout = '', stderr = ''): CommandResult => ({ code, stderr, stdout });

const fileSystemFor = (recordedMkdir: string[] = [], existing: string[] = []): FileSystem => ({
  exists: mock(async (path: string) => existing.includes(path)),
  mkdir: mock(async (path: string) => {
    recordedMkdir.push(path);
    return undefined;
  }),
  readFile: mock(async () => ''),
  rm: mock(async () => undefined),
  writeFile: mock(async () => undefined),
});

const headReaderFor =
  (heads: Record<string, string>): BinaryHeadReader =>
  async (path: string) =>
    heads[path] ?? '';

const ok = (stdout = 'sample output'): CommandResult => ({ code: 0, stderr: '', stdout });

test('treats a head with a NUL byte or invalid UTF-8 as binary content', () => {
  expect(isBinaryContent(bytes([0x61, 0x00, 0x62]))).toBeTrue();
  expect(isBinaryContent('plain ascii text')).toBeFalse();
  expect(isBinaryContent(`valid utf-8 bytes: caf${bytes([0xc3, 0xa9])}`)).toBeFalse();
  expect(isBinaryContent(bytes([0xc3, 0x28, 0x41]))).toBeTrue();
});

test('classifies every magic family from content alone without running file', async () => {
  const executor = mock(async (): Promise<CommandResult> => fail(2));
  const heads: ReadonlyArray<readonly [string, BinaryKind]> = [
    [bytes([0xcf, 0xfa, 0xed, 0xfe, 0x01, 0x00]), 'mach-o'],
    [bytes([0xce, 0xfa, 0xed, 0xfe]), 'mach-o'],
    [bytes([0xfe, 0xed, 0xfa, 0xcf]), 'mach-o'],
    [bytes([0xfe, 0xed, 0xfa, 0xce]), 'mach-o'],
    [bytes([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x00]), 'elf'],
    [`MZ${bytes([0x90])}`, 'pe'],
    [bytes([0x00, 0x61, 0x73, 0x6d]), 'wasm'],
    ['SQLite format 3\u0000', 'sqlite'],
    [`bplist00${bytes([0x00])}`, 'plist'],
    [bytes([0xc6, 0x1f, 0xbc, 0x03]), 'hermes'],
    [bytes([0xd4, 0xc3, 0xb2, 0xa1]), 'pcap'],
    [bytes([0xa1, 0xb2, 0xc3, 0xd4]), 'pcap'],
    [bytes([0x0a, 0x0d, 0x0d, 0x0a, 0x00]), 'pcap'],
    [bytes([0x1f, 0x8b, 0x08]), 'firmware'],
    [`070701${bytes([0x00])}`, 'firmware'],
    [`070707${bytes([0x00])}`, 'firmware'],
    [bytes([0x27, 0x05, 0x19, 0x56, 0x00]), 'firmware'],
    [`PK\u0003\u0004${bytes([0x00])}`, 'zip'],
    [`PK\u0005\u0006${bytes([0x00])}`, 'zip'],
    [`PK\u0007\u0008${bytes([0x00])}`, 'zip'],
    [`${bytes([0x04, 0x00, 0x00, 0x00, 0x6c, 0xf1, 0x48, 0x00])}{"files":`, 'asar'],
  ];
  for (const [head, kind] of heads) {
    const probe = await probeBinaryKind(executor, headReaderFor({ '/t': head }), '/t');
    expect(probe?.kind).toBe(kind);
    expect(probe?.attempts).toEqual([]);
  }
  expect(executor).not.toHaveBeenCalled();
});

test('rejects an asar-shaped text head without probing further', async () => {
  const executor = mock(async (): Promise<CommandResult> => fail(2));
  const textProbe = await probeBinaryKind(
    executor,
    headReaderFor({
      '/text': 'var x={"files":true};\nconsole.log(x)',
    }),
    '/text',
  );
  expect(textProbe).toBeUndefined();
  expect(executor).not.toHaveBeenCalled();
});

test('corroborates fat and unclassified binaries through file output, never the extension', async () => {
  const respondFor =
    (human: string, mime = 'application/octet-stream'): CommandExecutor =>
    async (spec: CommandSpec): Promise<CommandResult> =>
      spec.args.includes('--mime-type') ? ok(mime) : ok(human);
  const fat = await probeBinaryKind(
    respondFor('Mach-O universal binary (2 architectures)'),
    headReaderFor({ '/t': bytes([0xca, 0xfe, 0xba, 0xbe, 0x00]) }),
    '/t',
  );
  expect(fat?.kind).toBe('mach-o');
  expect(fat?.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-gate:mime',
    'binary-gate:file',
  ]);
  expect(fat?.detail).toContain('file(1)');
  const families: ReadonlyArray<readonly [string, BinaryKind]> = [
    ['Mono/.Net assembly', 'dotnet'],
    ['ELF 64-bit LSB pie executable', 'elf'],
    ['PE32+ executable (console)', 'pe'],
    ['Zip archive', 'zip'],
    ['SQLite 3.x database', 'sqlite'],
    ['WebAssembly (wasm) binary', 'wasm'],
    ['pcap capture file', 'pcap'],
    ['Apple binary property list', 'plist'],
    ['data', 'generic-binary'],
  ];
  for (const [human, kind] of families) {
    const probe = await probeBinaryKind(
      respondFor(human),
      headReaderFor({ '/t': bytes([0x01, 0x02, 0x00, 0x77]) }),
      '/t',
    );
    expect(probe?.kind).toBe(kind);
  }
  const silent = await probeBinaryKind(
    async () => fail(0),
    headReaderFor({ '/t': bytes([0x01, 0x02, 0x00, 0x77]) }),
    '/t',
  );
  expect(silent?.kind).toBe('generic-binary');
  expect(silent?.detail).toBe('unclassified binary');
});

test('extracts the flutter snapshot hash from a libapp.so head', async () => {
  const magic = bytes([0xf5, 0xf5, 0xdc, 0xdc]);
  // biome-ignore lint/security/noSecrets: deterministic test or regex fixture content, not a credential
  const hash = 'd1473a9c8f2a1b6d77e0c514a2b93f6c';
  const bigHead =
    bytes([0x7f, 0x45, 0x4c, 0x46, 0x00])
    + 'x'.repeat(12)
    + magic
    + 'y'.repeat(16)
    + hash
    + 'trailing';
  expect(flutterSnapshotHash(magic + 'y'.repeat(16) + hash)).toBe(hash);
  expect(flutterSnapshotHash('no snapshot magic here')).toBeUndefined();
  const probe = await probeBinaryKind(
    async () => fail(2),
    headReaderFor({ '/app/lib/arm64-v8a/libapp.so': bigHead }),
    '/app/lib/arm64-v8a/libapp.so',
  );
  expect(probe?.kind).toBe('elf');
  expect(probe?.detail).toContain(`flutter snapshot hash ${hash}`);
});

test('runs the mach-o inventory with native tools and stops when the query is answered', async () => {
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'lipo') {
      return ok('Archs: arm64');
    }
    if (spec.command === 'otool') {
      return ok('/usr/lib/libSystem.B.dylib');
    }
    if (spec.command === 'nm') {
      return ok('_security_check\n_needs_security');
    }
    return fail(2);
  });
  const mkdir: string[] = [];
  const route = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(mkdir),
    kind: 'mach-o',
    query: 'security',
    target: '/repo/tool',
  });
  expect(route.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-route:mach-o:inventory',
    'binary-route:mach-o:linkage',
    'binary-route:mach-o:exports',
  ]);
  expect(route.found).toBeTrue();
  expect(route.output).toContain('needs_security');
  expect(mkdir[0]).toContain('repo-search-binary/tool-');
  expect(route.attempts.every((attempt) => !attempt.strategy.includes('binary-tool'))).toBeTrue();
});

test('installs missing keg-only llvm tools once and resolves them by prefix', async () => {
  const specLog: CommandSpec[] = [];
  let prefixCalls = 0;
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the scripted executor keeps every routed command response explicit.
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    specLog.push(spec);
    if (spec.command === 'brew' && spec.args[0] === '--prefix') {
      prefixCalls += 1;
      return prefixCalls === 1 ? fail(1) : ok('/opt/homebrew/opt/llvm');
    }
    if (spec.command === 'brew') {
      return ok('Installed llvm');
    }
    if (spec.command === 'sh') {
      return ok('/opt/homebrew/bin/checksec');
    }
    if (spec.command === 'go') {
      return fail(1);
    }
    if (spec.command === 'strings') {
      return ok('libsystem strings');
    }
    return ok('resolved tool output');
  });
  const route = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'elf',
    query: 'unanswered-token',
    target: '/repo/server',
  });
  const install = specLog.find((spec) => spec.command === 'brew' && spec.args.includes('install'));
  expect(install?.args).toEqual(['install', '--formula', 'llvm']);
  expect(install?.environment).toEqual({ HOMEBREW_NO_ENV_HINTS: '1' });
  const strategies = route.attempts.map((attempt) => attempt.strategy);
  expect(strategies).toContain('binary-tool-check:llvm-readelf');
  expect(strategies).toContain('binary-tool-install:llvm-readelf');
  expect(strategies).toContain('binary-route:elf-pe:inventory');
  expect(strategies).toContain('binary-route:elf-pe:hardening');
  expect(strategies).not.toContain('binary-tool-check:radare2');
  expect(strategies).not.toContain('binary-tool-check:llvm-objdump');
  const readelf = specLog.find((spec) => spec.args.includes('-hlSW'));
  expect(readelf?.command).toBe('/opt/homebrew/opt/llvm/bin/llvm-readelf');
  expect(route.found).toBeTrue();
});

test('skips deep stages whose tool never resolves and records a skipped attempt', async () => {
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'sh') {
      return fail(1);
    }
    if (spec.command === 'brew') {
      return spec.args[0] === '--prefix' ? fail(1) : fail(2);
    }
    if (spec.command === 'otool' && spec.args[0] === '-tV') {
      return ok('disassembly of _main');
    }
    return ok('inventory evidence');
  });
  const route = await runBinaryRoute(executor, {
    deep: true,
    fileSystem: fileSystemFor(),
    kind: 'mach-o',
    query: 'unanswered-token',
    target: '/repo/tool',
  });
  const strategies = route.attempts.map((attempt) => attempt.strategy);
  expect(strategies).toContain('binary-route:native-logic:disassembly');
  expect(strategies).toContain('binary-route:native-logic:analysis');
  expect(strategies).toContain('binary-route:native-logic:decompile-project');
  const analysis = route.attempts.find(
    (attempt) => attempt.strategy === 'binary-route:native-logic:analysis',
  );
  expect(analysis?.status).toBe('skipped');
  expect(analysis?.detail).toContain('unavailable after its install stage');
  const decompile = route.attempts.find(
    (attempt) => attempt.strategy === 'binary-route:native-logic:decompile-project',
  );
  expect(decompile?.status).toBe('skipped');
});

test('caps every attempt detail and the returned route output', async () => {
  const long = 'x'.repeat(25_000);
  const executor = mock(async (): Promise<CommandResult> => ok(long));
  const route = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'plist',
    query: '',
    target: '/repo/Info.plist',
  });
  expect(route.attempts[0]?.detail.length).toBeLessThan(21_100);
  expect(route.attempts[0]?.detail).toContain('truncated');
  expect(route.output.length).toBeLessThan(21_100);
});

test('extracts zip containers and searches the extraction tree', async () => {
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'unzip') {
      return spec.args[0] === '-l'
        ? ok('Archive: app.apk\n  classes.dex\n  assets/config.js')
        : ok(' inflating: config.js');
    }
    if (spec.command === 'rg') {
      return spec.args.includes('--files')
        ? fail(1)
        : ok('/tmp/repo-search-binary/app.apk-abc/assets/config.js:3:tokenneedle');
    }
    return fail(2);
  });
  const route = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'zip',
    query: 'tokenneedle',
    target: '/repo/app.apk',
  });
  expect(route.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-route:apk:listing',
    'binary-route:apk:unzip',
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-files',
  ]);
  expect(route.found).toBeTrue();
  expect(route.output).toContain('tokenneedle');
  const literal = route.attempts.find((attempt) => attempt.strategy === 'rg-literal');
  expect(literal?.command).toContain('/repo-search-binary/app.apk-');
});

test('routes container families through extraction and the staged fallback', async () => {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the scripted executor keeps every routed command response explicit.
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'npx') {
      return ok('extracting archive');
    }
    if (spec.command === 'sh') {
      return ok('/Users/dev/.dotnet/tools/ilspycmd');
    }
    if (spec.command === '/usr/local/bin/dotnet' && spec.args[0] === '--version') {
      return ok('10.0.401');
    }
    if (spec.command === '/Users/dev/.dotnet/tools/ilspycmd') {
      return ok('Decompiling Assembly');
    }
    if (spec.command === 'cp') {
      return ok('');
    }
    if (spec.command === 'binwalk') {
      return ok('DECIMAL       HEX');
    }
    if (spec.command === 'sqlite3') {
      return spec.args[1] === '.schema' ? ok('CREATE TABLE users') : ok('users logs');
    }
    if (spec.command === 'rg') {
      return spec.args.includes('--files') ? fail(1) : fail(1);
    }
    return ok('route evidence');
  });
  const asar = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'asar',
    query: 'unanswered',
    target: '/repo/app.asar',
  });
  expect(asar.attempts.map((attempt) => attempt.strategy)).toContain(
    'binary-route:electron-asar:extract',
  );
  expect(asar.found).toBeTrue();
  const dotnet = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'dotnet',
    query: 'unanswered',
    target: '/repo/App.dll',
  });
  expect(dotnet.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-tool-check:dotnet',
    'binary-tool-check:ilspycmd -p',
    'binary-route:dotnet:boundary',
    'binary-route:dotnet:decompile',
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-files',
  ]);
  const firmware = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'firmware',
    query: 'unanswered',
    target: '/repo/fw.bin',
  });
  expect(firmware.attempts.map((attempt) => attempt.strategy)).toContain(
    'binary-route:firmware:signatures',
  );
  const copy = firmware.attempts.find(
    (attempt) => attempt.strategy === 'binary-route:firmware:copy',
  );
  expect(copy?.command).toContain('cp -c /repo/fw.bin');
  const sqlite = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'sqlite',
    query: 'unanswered',
    target: '/repo/app.db',
  });
  const schema = sqlite.attempts.find(
    (attempt) => attempt.strategy === 'binary-route:sqlite:schema',
  );
  expect(schema?.command).toContain('file:');
  expect(schema?.command).toContain('?mode=ro');
});

test('the sqlite copy stage carries the WAL companions into the extraction directory', async () => {
  const executor = mock(async (): Promise<CommandResult> => ok('CREATE TABLE users'));
  const route = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor([], ['/repo/app.db-shm', '/repo/app.db-wal']),
    kind: 'sqlite',
    query: 'unanswered',
    target: '/repo/app.db',
  });
  const copy = route.attempts.find((attempt) => attempt.strategy === 'binary-route:sqlite:copy');
  expect(copy?.command).toContain('cp -c /repo/app.db /repo/app.db-shm /repo/app.db-wal ');
  expect(copy?.command).toContain('/repo-search-binary/app.db-');
});

test('the sqlite copy stage copies the database alone when no WAL companions exist', async () => {
  const executor = mock(async (): Promise<CommandResult> => ok('CREATE TABLE users'));
  const route = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'sqlite',
    query: 'unanswered',
    target: '/repo/app.db',
  });
  const copy = route.attempts.find((attempt) => attempt.strategy === 'binary-route:sqlite:copy');
  expect(copy?.command).toContain('cp -c /repo/app.db ');
  expect(copy?.command).not.toContain('-wal');
});

test('companion detection keeps only the sidecars that exist', async () => {
  const executor = mock(async (): Promise<CommandResult> => ok('CREATE TABLE users'));
  const route = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor([], ['/repo/app.db-wal']),
    kind: 'sqlite',
    query: 'unanswered',
    target: '/repo/app.db',
  });
  const copy = route.attempts.find((attempt) => attempt.strategy === 'binary-route:sqlite:copy');
  expect(copy?.command).toContain('/repo/app.db-wal');
  expect(copy?.command).not.toContain('-shm');
});

test('a silently successful extraction still runs the staged extraction search', async () => {
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'rg') {
      return ok('dsh/graph-memory/prompt.js:1: the memory extraction prompt');
    }
    return ok('');
  });
  const route = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'asar',
    query: 'graph-memory',
    target: '/repo/app.asar',
  });
  expect(route.found).toBeTrue();
  expect(route.output).toContain('memory extraction prompt');
  expect(route.attempts.map((attempt) => attempt.strategy)).toContain('rg-literal');
});

test('routes the small families through their owned rows', async () => {
  const probes = new Map<string, number>();
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the scripted executor keeps every routed command response explicit.
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'sh') {
      const probe = spec.args[1] ?? '';
      const count = (probes.get(probe) ?? 0) + 1;
      probes.set(probe, count);
      if (probe.includes('tshark')) {
        return count === 1 ? fail(1) : ok('/opt/homebrew/bin/tshark');
      }
      return probe.includes('prettier')
        ? ok('/opt/homebrew/bin/prettier')
        : ok('/opt/homebrew/bin/wasm-objdump');
    }
    if (spec.command === 'brew') {
      return spec.args[0] === '--prefix' ? fail(1) : ok('Installed wireshark');
    }
    if (spec.command === '/opt/homebrew/bin/tshark') {
      return ok('TCP Conversations');
    }
    if (spec.command === 'plutil') {
      // biome-ignore lint/security/noSecrets: deterministic test or regex fixture content, not a credential
      return ok('{"CFBundleIdentifier" => "com.example"}');
    }
    if (spec.command === 'strings') {
      return ok('readable strings inside the binary');
    }
    if (spec.command === '/opt/homebrew/bin/prettier') {
      return ok('const value = 1;');
    }
    if (spec.command === '/opt/homebrew/bin/wasm-objdump') {
      return ok('Type section');
    }
    return ok('row evidence');
  });
  const pcap = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'pcap',
    query: 'unanswered',
    target: '/repo/capture.pcap',
  });
  const pcapStrategies = pcap.attempts.map((attempt) => attempt.strategy);
  expect(pcapStrategies).toContain('binary-tool-check:tshark-wireshark');
  expect(pcapStrategies).toContain('binary-tool-install:tshark-wireshark');
  expect(pcapStrategies).toContain('binary-route:pcap-har:names');
  const conversations = pcap.attempts.find(
    (attempt) => attempt.strategy === 'binary-route:pcap-har:conversations',
  );
  expect(conversations?.status).toBe('found');
  expect(conversations?.command).toContain('/opt/homebrew/bin/tshark -r');
  const plist = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'plist',
    query: 'CFBundleIdentifier',
    target: '/repo/Info.plist',
  });
  expect(plist.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-route:plist-nib-car:print',
  ]);
  expect(plist.found).toBeTrue();
  for (const kind of ['hermes', 'generic-binary'] as const) {
    const strings = await runBinaryRoute(executor, {
      deep: false,
      fileSystem: fileSystemFor(),
      kind,
      query: 'unanswered',
      target: '/repo/blob',
    });
    expect(strings.attempts[0]?.strategy).toContain('strings');
  }
  const bundle = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'text-bundle',
    query: 'unanswered',
    target: '/repo/app.min.js',
  });
  expect(bundle.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-tool-check:prettier',
    'binary-route:web-bundle:pretty-print',
  ]);
  const wasm = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'wasm',
    query: 'unanswered',
    target: '/repo/module.wasm',
  });
  expect(wasm.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-tool-check:wasm-objdump',
    'binary-route:wasm:headers',
  ]);
});

test('executes the fat and pe rows through the mach-o and elf-pe route sets', async () => {
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'sh') {
      return fail(1);
    }
    if (spec.command === 'brew' && spec.args[0] === '--prefix') {
      return ok('/opt/homebrew/opt/llvm');
    }
    return ok('row evidence');
  });
  const fat = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'fat',
    query: 'unanswered',
    target: '/repo/universal',
  });
  expect(fat.attempts.map((attempt) => attempt.strategy)).toContain(
    'binary-route:mach-o:inventory',
  );
  const pe = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'pe',
    query: 'unanswered',
    target: '/repo/tool.exe',
  });
  expect(pe.attempts.map((attempt) => attempt.strategy)).toContain('binary-route:elf-pe:hardening');
});

test('classifies every located binary candidate and decodes only as the query requires', async () => {
  const probed: string[] = [];
  const headReader: BinaryHeadReader = async (path: string) => {
    probed.push(path);
    if (path === '/repo/blob.bin') {
      return bytes([0xcf, 0xfa, 0xed, 0xfe, 0x01, 0x00]);
    }
    return 'plain text content';
  };
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'lipo') {
      return ok('Archs: x86_64 arm64');
    }
    if (spec.command === 'sh') {
      return fail(1);
    }
    if (spec.command === 'brew') {
      return spec.args[0] === '--prefix' ? fail(1) : fail(2);
    }
    return ok('stage evidence');
  });
  const gate = await runBinaryGate(executor, {
    candidates: ['/repo/note.txt', '/repo/blob.bin', '/repo/never.bin'],
    headReader,
    query: 'evidence',
  });
  expect(probed).toEqual(['/repo/note.txt', '/repo/blob.bin']);
  expect(gate.found).toBeTrue();
  const classify = gate.attempts.find((attempt) => attempt.strategy === 'binary-gate:classify');
  expect(classify?.detail).toContain('magic bytes: mach-o');
  const strategies = gate.attempts.map((attempt) => attempt.strategy);
  expect(strategies).toContain('binary-route:mach-o:linkage');
  expect(strategies).not.toContain('binary-route:native-logic:disassembly');
  const quiet = await runBinaryGate(executor, {
    candidates: ['/repo/note.txt'],
    headReader,
    query: 'unanswered-token',
  });
  expect(quiet.attempts).toEqual([]);
  expect(quiet.found).toBeFalse();
});

test('classifies every located binary and stays shallow when the classification answers', async () => {
  const headReader = headReaderFor({
    '/repo/blob.bin': bytes([0xcf, 0xfa, 0xed, 0xfe, 0x01, 0x00]),
  });
  const executor = mock(async (): Promise<CommandResult> => ok('stage evidence'));
  const gate = await runBinaryGate(executor, {
    candidates: ['/repo/blob.bin'],
    headReader,
    query: 'mach-o',
  });
  const strategies = gate.attempts.map((attempt) => attempt.strategy);
  expect(strategies).toContain('binary-gate:classify');
  expect(strategies).not.toContain('binary-tool-check:radare2');
});

test('shapes explicit targets by their provided form only', () => {
  expect(binaryTargetShape('https://example.com/app.js')).toEqual({ shape: 'url' });
  expect(binaryTargetShape('http://example.com')).toEqual({ shape: 'url' });
  expect(binaryTargetShape('4501')).toEqual({ shape: 'process-pid' });
  expect(binaryTargetShape('/Users/dev/repo/app.asar')).toEqual({ shape: 'file' });
  expect(binaryTargetShape('Safari')).toEqual({ shape: 'process' });
});

test('fetches an explicit website target and its script sources', async () => {
  const executor = mock(
    async (spec: CommandSpec): Promise<CommandResult> =>
      spec.args[spec.args.length - 1] === 'https://example.com'
        ? ok('<script src="/app.js"></script><p>tokenneedle</p>')
        : ok('const tokenneedle = 1;'),
  );
  const page = await runExplicitBinaryTarget(executor, {
    headReader: headReaderFor({}),
    queries: ['tokenneedle'],
    root: '/repo',
    target: 'https://example.com',
  });
  expect(page.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-route:website:fetch',
    'binary-route:website:script',
  ]);
  expect(page.found).toBeTrue();
  expect(page.source).toBe('binary');
  const deadSite = await runExplicitBinaryTarget(async () => fail(22, '', 'timeout'), {
    headReader: headReaderFor({}),
    queries: [],
    root: '/repo',
    target: 'https://down.example.com',
  });
  expect(deadSite.found).toBeFalse();
  expect(deadSite.attempts[0]?.status).toBe('error');
});

test('probes an explicit running process by pid and by exact name', async () => {
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'pgrep') {
      return spec.args[1] === 'Safari' ? ok('4501\n4502') : fail(1);
    }
    return ok('process evidence');
  });
  const byPid = await runExplicitBinaryTarget(executor, {
    headReader: headReaderFor({}),
    queries: [],
    root: '/repo',
    target: '999',
  });
  expect(byPid.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-route:running-app:process',
    'binary-route:running-app:logs',
  ]);
  expect(byPid.found).toBeTrue();
  const byName = await runExplicitBinaryTarget(executor, {
    headReader: headReaderFor({}),
    queries: [],
    root: '/repo',
    target: 'Safari',
  });
  expect(byName.attempts[0]?.strategy).toBe('binary-route:running-app:pgrep');
  const missing = await runExplicitBinaryTarget(executor, {
    headReader: headReaderFor({}),
    queries: [],
    root: '/repo',
    target: 'GhostApp',
  });
  expect(missing.found).toBeFalse();
  expect(missing.output).toContain('No running process matches');
});

test('rejects an explicit file target outside the approved root', async () => {
  await expect(
    runExplicitBinaryTarget(async () => fail(2), {
      headReader: headReaderFor({}),
      queries: [],
      root: '/Users/dev/repo',
      target: '/etc/passwd',
    }),
  ).rejects.toThrow('outside the approved root');
});

test('reports an unreadable explicit target', async () => {
  const receipt = await runExplicitBinaryTarget(async () => fail(2), {
    headReader: headReaderFor({}),
    queries: [],
    root: '/repo',
    target: '/repo/missing.bin',
  });
  expect(receipt.attempts[0]?.status).toBe('error');
  expect(receipt.found).toBeFalse();
});

test('skips an explicit text target without bundle shape', async () => {
  const receipt = await runExplicitBinaryTarget(async () => fail(2), {
    headReader: headReaderFor({ '/repo/plain.txt': 'ordinary text lines' }),
    queries: [],
    root: '/repo',
    target: '/repo/plain.txt',
  });
  expect(receipt.attempts[0]?.status).toBe('skipped');
  expect(receipt.attempts[0]?.detail).toContain('no bundle shape');
});

test('pretty-prints an explicit minified bundle target', async () => {
  const executor = mock(
    async (spec: CommandSpec): Promise<CommandResult> =>
      spec.command === 'sh' ? ok('/opt/homebrew/bin/prettier') : ok('const value = 1;'),
  );
  const mapped = await runExplicitBinaryTarget(executor, {
    headReader: headReaderFor({
      '/repo/app.js': 'var a=1;console.log(a);//# sourceMappingURL=app.js.map',
    }),
    queries: ['value'],
    root: '/repo',
    target: '/repo/app.js',
  });
  expect(mapped.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-tool-check:prettier',
    'binary-route:web-bundle:pretty-print',
  ]);
  expect(mapped.found).toBeTrue();
  const longLine = 'x'.repeat(600);
  const longLineTarget = await runExplicitBinaryTarget(executor, {
    headReader: headReaderFor({ '/repo/long.js': longLine }),
    queries: ['value'],
    root: '/repo',
    target: '/repo/long.js',
  });
  expect(longLineTarget.source).toBe('binary');
});

test('probes an explicit binary target end to end', async () => {
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'lipo') {
      return ok('Archs: arm64');
    }
    if (spec.command === 'sh') {
      return fail(1);
    }
    if (spec.command === 'brew') {
      return spec.args[0] === '--prefix' ? fail(1) : fail(2);
    }
    return ok('inventory evidence');
  });
  const receipt = await runExplicitBinaryTarget(executor, {
    headReader: headReaderFor({
      '/repo/tool': bytes([0xcf, 0xfa, 0xed, 0xfe, 0x01, 0x00]),
    }),
    queries: [],
    root: '/repo',
    target: '/repo/tool',
  });
  expect(receipt.attempts[0]?.strategy).toBe('binary-gate:classify');
  expect(receipt.attempts[0]?.detail).toContain('magic bytes: mach-o');
  expect(receipt.found).toBeTrue();
});

test('reads bounded heads natively and returns empty for unreadable paths', async () => {
  const originalFile = Bun.file;
  try {
    Bun.file = mock(() => ({
      slice: () => ({
        arrayBuffer: () => Promise.resolve(new Uint8Array([0xcf, 0xfa]).buffer),
      }),
    })) as unknown as typeof Bun.file;
    expect(await defaultBinaryHeadReader('/anywhere', 2)).toBe(bytes([0xcf, 0xfa]));
    Bun.file = mock(() => {
      throw new Error('no such file');
    }) as unknown as typeof Bun.file;
    expect(await defaultBinaryHeadReader('/missing', 2)).toBe('');
  } finally {
    Bun.file = originalFile;
  }
});

test('records an error attempt and continues when a stage executor throws', async () => {
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'nm') {
      throw new Error('spawn failed');
    }
    return ok('stage evidence');
  });
  const route = await runBinaryRoute(executor, {
    deep: false,
    fileSystem: fileSystemFor(),
    kind: 'mach-o',
    query: 'unanswered',
    target: '/repo/tool',
  });
  const exports = route.attempts.find(
    (attempt) => attempt.strategy === 'binary-route:mach-o:exports',
  );
  expect(exports?.status).toBe('error');
  expect(exports?.detail).toBe('spawn failed');
  expect(route.attempts.map((attempt) => attempt.strategy)).toContain(
    'binary-route:mach-o:strings',
  );
  expect(route.found).toBeTrue();
});

test('records a skipped stage when an installed tool still does not resolve', async () => {
  let installCalls = 0;
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'unzip') {
      return ok('Archive listing');
    }
    if (spec.command === 'sh') {
      return fail(1);
    }
    if (spec.command === 'brew') {
      installCalls += 1;
      return ok('Installed jadx');
    }
    return fail(2);
  });
  const route = await runBinaryRoute(executor, {
    deep: true,
    fileSystem: fileSystemFor(),
    kind: 'zip',
    query: 'unanswered',
    target: '/repo/app.apk',
  });
  expect(installCalls).toBe(1);
  const decompile = route.attempts.find(
    (attempt) => attempt.strategy === 'binary-route:apk:decompile',
  );
  expect(decompile?.status).toBe('skipped');
});

test('executes deep stages once their routed tools resolve', async () => {
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'sh') {
      return ok('/opt/homebrew/bin/routed');
    }
    if (spec.command === 'brew' && spec.args[0] === '--prefix') {
      return ok(spec.args[1] === 'ghidra' ? '/opt/homebrew/opt/ghidra' : '/opt/homebrew/opt/llvm');
    }
    return ok('deep stage evidence');
  });
  const elf = await runBinaryRoute(executor, {
    deep: true,
    fileSystem: fileSystemFor(),
    kind: 'elf',
    query: 'unanswered',
    target: '/repo/server',
  });
  const elfStrategies = elf.attempts.map((attempt) => attempt.strategy);
  expect(elfStrategies).toContain('binary-route:native-logic:disassembly');
  expect(elfStrategies).toContain('binary-route:native-logic:analysis');
  expect(elfStrategies).toContain('binary-route:native-logic:decompile-project');
  const decompile = elf.attempts.find(
    (attempt) => attempt.strategy === 'binary-route:native-logic:decompile-project',
  );
  expect(decompile?.command).toContain('/opt/homebrew/opt/ghidra/libexec/support/analyzeHeadless');
  const firmware = await runBinaryRoute(executor, {
    deep: true,
    fileSystem: fileSystemFor(),
    kind: 'firmware',
    query: 'unanswered',
    target: '/repo/fw.bin',
  });
  expect(firmware.attempts.map((attempt) => attempt.strategy)).toContain(
    'binary-route:firmware:unblob',
  );
  const wasm = await runBinaryRoute(executor, {
    deep: true,
    fileSystem: fileSystemFor(),
    kind: 'wasm',
    query: 'unanswered',
    target: '/repo/module.wasm',
  });
  expect(wasm.attempts.map((attempt) => attempt.strategy)).toContain('binary-route:wasm:text');
  const apk = await runBinaryRoute(executor, {
    deep: true,
    fileSystem: fileSystemFor(),
    kind: 'zip',
    query: 'unanswered',
    target: '/repo/app.apk',
  });
  expect(apk.attempts.map((attempt) => attempt.strategy)).toContain('binary-route:apk:decompile');
});

test('records a skipped stage when a keg install succeeds but the reprobe fails', async () => {
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    if (spec.command === 'brew' && spec.args[0] === '--prefix') {
      return fail(1);
    }
    if (spec.command === 'sh') {
      return fail(1);
    }
    return ok('Installed');
  });
  const route = await runBinaryRoute(executor, {
    deep: true,
    fileSystem: fileSystemFor(),
    kind: 'mach-o',
    query: 'unanswered',
    target: '/repo/tool',
  });
  const decompile = route.attempts.find(
    (attempt) => attempt.strategy === 'binary-route:native-logic:decompile-project',
  );
  expect(decompile?.status).toBe('skipped');
  const checks = route.attempts.filter(
    (attempt) => attempt.strategy === 'binary-tool-check:ghidra',
  );
  expect(checks).toHaveLength(2);
});

test('returns no attempts for a tool without a registered installer', async () => {
  const executor = mock(async (): Promise<CommandResult> => fail(2));
  const ensured = await ensureBinaryTool(executor, 'never-registered');
  expect(ensured.attempts).toEqual([]);
  expect(ensured.resolved).toBeUndefined();
  expect(executor).not.toHaveBeenCalled();
});

test('stops fetching website scripts once one answers the query', async () => {
  const fetchedSources: string[] = [];
  const executor = mock(async (spec: CommandSpec): Promise<CommandResult> => {
    const target = spec.args[spec.args.length - 1] ?? '';
    if (target === 'https://example.com') {
      return ok('<script src="/first.js"></script><script src="/second.js"></script>');
    }
    fetchedSources.push(target);
    return target === '/first.js' ? ok('const unrelated = 1;') : ok('const tokenneedle = 1;');
  });
  const page = await runExplicitBinaryTarget(executor, {
    headReader: headReaderFor({}),
    queries: ['tokenneedle'],
    root: '/repo',
    target: 'https://example.com',
  });
  expect(fetchedSources).toEqual(['/first.js', '/second.js']);
  expect(page.attempts.map((attempt) => attempt.strategy)).toEqual([
    'binary-route:website:fetch',
    'binary-route:website:script',
    'binary-route:website:script',
  ]);
  expect(page.output).toContain('tokenneedle');
});

test('enumerates exactly the eighteen route rows of the binary router', () => {
  expect(binaryRouteRows).toHaveLength(18);
  expect(binaryRouteRows).toContain('electron-asar');
  expect(binaryRouteRows).toContain('native-logic');
  expect(binaryRouteRows).toContain('pcap-har');
  expect(binaryRouteRows).toContain('website');
  expect(binaryRouteRows).toContain('running-app');
});
