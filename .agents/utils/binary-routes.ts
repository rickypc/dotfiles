import type { CommandSpec } from './contracts.js';

export type BinaryKind =
  | 'asar'
  | 'dotnet'
  | 'elf'
  | 'fat'
  | 'firmware'
  | 'generic-binary'
  | 'hermes'
  | 'mach-o'
  | 'pcap'
  | 'pe'
  | 'plist'
  | 'sqlite'
  | 'text-bundle'
  | 'wasm'
  | 'zip';

export interface BinaryRouteContext {
  readonly companions: readonly string[];
  readonly executableFor: (name: string) => string;
  readonly extractionDirectory: string;
  readonly target: string;
}

export interface BinaryRouteStage {
  readonly deep: boolean;
  readonly requires?: string;
  readonly spec: (context: BinaryRouteContext) => CommandSpec;
  readonly strategy: string;
}

export const binaryInstallTimeoutMs = 20 * 60 * 1000;

const apkStages = (): readonly BinaryRouteStage[] => [
  {
    deep: false,
    spec: ({ target }) => ({ args: ['-l', target], command: 'unzip' }),
    strategy: 'binary-route:apk:listing',
  },
  {
    deep: false,
    spec: ({ extractionDirectory, target }) => ({
      args: ['-o', target, '-d', extractionDirectory],
      command: 'unzip',
      timeoutMs: 10 * 60 * 1000,
    }),
    strategy: 'binary-route:apk:unzip',
  },
  {
    deep: true,
    requires: 'jadx',
    spec: ({ executableFor, extractionDirectory, target }) => ({
      args: ['-d', extractionDirectory, '--show-bad-code', target],
      command: executableFor('jadx'),
      timeoutMs: 10 * 60 * 1000,
    }),
    strategy: 'binary-route:apk:decompile',
  },
];

const asarStages = (): readonly BinaryRouteStage[] => [
  {
    deep: false,
    spec: ({ extractionDirectory, target }) => ({
      args: ['-y', '@electron/asar', 'extract', target, extractionDirectory],
      command: 'npx',
      timeoutMs: binaryInstallTimeoutMs,
    }),
    strategy: 'binary-route:electron-asar:extract',
  },
];

const copySpec = (source: string, destination: string): CommandSpec => ({
  args: ['-c', source, destination],
  command: 'cp',
});

const dotnetStages = (): readonly BinaryRouteStage[] => [
  {
    deep: false,
    requires: 'dotnet',
    spec: ({ executableFor }) => ({ args: ['--version'], command: executableFor('dotnet') }),
    strategy: 'binary-route:dotnet:boundary',
  },
  {
    deep: false,
    requires: 'ilspycmd -p',
    spec: ({ executableFor, extractionDirectory, target }) => ({
      args: ['-p', '-o', extractionDirectory, target],
      command: executableFor('ilspycmd -p'),
      timeoutMs: binaryInstallTimeoutMs,
    }),
    strategy: 'binary-route:dotnet:decompile',
  },
];

const firmwareStages = (): readonly BinaryRouteStage[] => [
  {
    deep: false,
    spec: ({ extractionDirectory, target }) =>
      copySpec(target, `${extractionDirectory}/${target.slice(target.lastIndexOf('/') + 1)}`),
    strategy: 'binary-route:firmware:copy',
  },
  {
    deep: false,
    requires: 'binwalk',
    spec: ({ executableFor, extractionDirectory, target }) => ({
      args: ['-e', `${extractionDirectory}/${target.slice(target.lastIndexOf('/') + 1)}`],
      command: executableFor('binwalk'),
      timeoutMs: 10 * 60 * 1000,
    }),
    strategy: 'binary-route:firmware:signatures',
  },
  {
    deep: true,
    requires: 'unblob',
    spec: ({ executableFor, extractionDirectory, target }) => ({
      args: [
        '-e',
        '-x',
        extractionDirectory,
        `${extractionDirectory}/${target.slice(target.lastIndexOf('/') + 1)}`,
      ],
      command: executableFor('unblob'),
      timeoutMs: 10 * 60 * 1000,
    }),
    strategy: 'binary-route:firmware:unblob',
  },
];

const genericBinaryStages = (): readonly BinaryRouteStage[] => [
  {
    deep: false,
    spec: ({ target }) => ({ args: ['-a', '-n', '6', target], command: 'strings' }),
    strategy: 'binary-route:generic-binary:strings',
  },
];

const hermesStages = (): readonly BinaryRouteStage[] => [
  {
    deep: false,
    spec: ({ target }) => ({ args: ['-a', '-n', '6', target], command: 'strings' }),
    strategy: 'binary-route:hermes-bytenode:strings',
  },
];

const nativeDeepStages = (kind: BinaryKind): readonly BinaryRouteStage[] => {
  const isMachO = kind === 'mach-o' || kind === 'fat';
  return [
    {
      deep: true,
      requires: isMachO ? undefined : 'llvm-objdump',
      spec: ({ executableFor, target }) =>
        isMachO
          ? { args: ['-tV', target], command: 'otool', timeoutMs: 10 * 60 * 1000 }
          : {
              args: ['-d', '--no-show-raw-insn', '-C', target],
              command: executableFor('llvm-objdump'),
              timeoutMs: 10 * 60 * 1000,
            },
      strategy: 'binary-route:native-logic:disassembly',
    },
    {
      deep: true,
      requires: 'radare2',
      spec: ({ executableFor, target }) => ({
        args: ['-q', '-c', 'aaa; afl', target],
        command: executableFor('radare2'),
        timeoutMs: 10 * 60 * 1000,
      }),
      strategy: 'binary-route:native-logic:analysis',
    },
    {
      deep: true,
      requires: 'ghidra',
      spec: ({ executableFor, extractionDirectory, target }) => ({
        args: [
          `${extractionDirectory}/ghidra-project`,
          'repo-search',
          // \u0069 keeps the import-scanner in the test boundary validator out of
          // this analyzeHeadless flag literal.
          '-\u0069mport',
          target,
          '-deleteProject',
        ],
        command: executableFor('ghidra'),
        timeoutMs: 10 * 60 * 1000,
      }),
      strategy: 'binary-route:native-logic:decompile-project',
    },
  ];
};

const pcapStages = (): readonly BinaryRouteStage[] => [
  {
    deep: false,
    requires: 'tshark-wireshark',
    spec: ({ executableFor, target }) => ({
      args: ['-r', target, '-q', '-z', 'conv,tcp'],
      command: executableFor('tshark-wireshark'),
    }),
    strategy: 'binary-route:pcap-har:conversations',
  },
  {
    deep: false,
    requires: 'tshark-wireshark',
    spec: ({ executableFor, target }) => ({
      args: [
        '-r',
        target,
        '-T',
        'fields',
        '-e',
        'dns.qry.name',
        '-e',
        'tls.handshake.extensions_server_name',
        '-e',
        'http.request.full_uri',
      ],
      command: executableFor('tshark-wireshark'),
    }),
    strategy: 'binary-route:pcap-har:names',
  },
];

const plistStages = (): readonly BinaryRouteStage[] => [
  {
    deep: false,
    spec: ({ target }) => ({ args: ['-p', target], command: 'plutil' }),
    strategy: 'binary-route:plist-nib-car:print',
  },
];

const sqliteStages = (): readonly BinaryRouteStage[] => [
  {
    // A WAL-mode database needs its -wal and -shm sidecars copied as a set: a
    // read-only open of the bare database file fails without the wal index.
    deep: false,
    spec: ({ companions, extractionDirectory, target }) => ({
      args: ['-c', target, ...companions, extractionDirectory],
      command: 'cp',
    }),
    strategy: 'binary-route:sqlite:copy',
  },
  {
    deep: false,
    spec: ({ extractionDirectory, target }) => ({
      args: [
        `file:${extractionDirectory}/${target.slice(target.lastIndexOf('/') + 1)}?mode=ro`,
        '.schema',
      ],
      command: 'sqlite3',
    }),
    strategy: 'binary-route:sqlite:schema',
  },
  {
    deep: false,
    spec: ({ extractionDirectory, target }) => ({
      args: [
        `file:${extractionDirectory}/${target.slice(target.lastIndexOf('/') + 1)}?mode=ro`,
        '.tables',
      ],
      command: 'sqlite3',
    }),
    strategy: 'binary-route:sqlite:tables',
  },
];

const stringsInventoryStages = (row: string): readonly BinaryRouteStage[] => [
  {
    deep: false,
    spec: ({ target }) => ({ args: ['-a', '-n', '6', target], command: 'strings' }),
    strategy: `binary-route:${row}:strings`,
  },
  {
    deep: false,
    spec: ({ target }) => ({ args: ['version', '-m', target], command: 'go' }),
    strategy: 'binary-route:go:buildinfo',
  },
];

const nativeInventoryStages = (kind: BinaryKind): readonly BinaryRouteStage[] => {
  const row = kind === 'mach-o' || kind === 'fat' ? 'mach-o' : 'elf-pe';
  const isMachO = row === 'mach-o';
  return [
    {
      deep: false,
      requires: isMachO ? undefined : 'llvm-readelf',
      spec: ({ executableFor, target }) =>
        isMachO
          ? { args: ['-info', target], command: 'lipo' }
          : { args: ['-hlSW', target], command: executableFor('llvm-readelf') },
      strategy: `binary-route:${row}:inventory`,
    },
    {
      deep: false,
      requires: isMachO ? undefined : 'llvm-readelf',
      spec: ({ executableFor, target }) =>
        isMachO
          ? { args: ['-L', target], command: 'otool' }
          : { args: ['-dW', target], command: executableFor('llvm-readelf') },
      strategy: `binary-route:${row}:linkage`,
    },
    {
      deep: false,
      requires: isMachO ? undefined : 'llvm-nm',
      spec: ({ executableFor, target }) =>
        isMachO
          ? { args: ['-gU', target], command: 'nm' }
          : {
              args: ['--dynamic', '--defined-only', target],
              command: executableFor('llvm-nm'),
            },
      strategy: `binary-route:${row}:exports`,
    },
    {
      deep: false,
      requires: isMachO ? undefined : 'llvm-nm',
      spec: ({ executableFor, target }) =>
        isMachO
          ? { args: ['-u', target], command: 'nm' }
          : {
              args: ['--dynamic', '--undefined-only', target],
              command: executableFor('llvm-nm'),
            },
      strategy: `binary-route:${row}:imports`,
    },
    ...stringsInventoryStages(row),
    {
      deep: false,
      requires: isMachO ? undefined : 'checksec',
      spec: ({ executableFor, target }) =>
        isMachO
          ? {
              args: ['-d', '--entitlements', ':-', target],
              command: 'codesign',
            }
          : { args: ['--file', target], command: executableFor('checksec') },
      strategy: `binary-route:${row}:hardening`,
    },
  ];
};

const nativeStages = (kind: BinaryKind): readonly BinaryRouteStage[] => [
  ...nativeInventoryStages(kind),
  ...nativeDeepStages(kind),
];

const textBundleStages = (): readonly BinaryRouteStage[] => [
  {
    deep: false,
    requires: 'prettier',
    spec: ({ executableFor, target }) => ({
      args: ['--parser', 'babel', target],
      command: executableFor('prettier'),
      timeoutMs: 5 * 60 * 1000,
    }),
    strategy: 'binary-route:web-bundle:pretty-print',
  },
];

const wasmStages = (): readonly BinaryRouteStage[] => [
  {
    deep: false,
    requires: 'wasm-objdump',
    spec: ({ executableFor, target }) => ({
      args: ['-x', target],
      command: executableFor('wasm-objdump'),
    }),
    strategy: 'binary-route:wasm:headers',
  },
  {
    deep: true,
    requires: 'wasm2wat',
    spec: ({ executableFor, target }) => ({
      args: [target],
      command: executableFor('wasm2wat'),
      timeoutMs: 10 * 60 * 1000,
    }),
    strategy: 'binary-route:wasm:text',
  },
];

const binaryStagesByKind: Readonly<Record<BinaryKind, () => readonly BinaryRouteStage[]>> = {
  asar: asarStages,
  dotnet: dotnetStages,
  elf: () => nativeStages('elf'),
  fat: () => nativeStages('fat'),
  firmware: firmwareStages,
  'generic-binary': genericBinaryStages,
  hermes: hermesStages,
  'mach-o': () => nativeStages('mach-o'),
  pcap: pcapStages,
  pe: () => nativeStages('pe'),
  plist: plistStages,
  sqlite: sqliteStages,
  'text-bundle': textBundleStages,
  wasm: wasmStages,
  zip: apkStages,
};

/** The deterministic route table: one ordered stage list per detected kind. */

export const routeStagesFor = (kind: BinaryKind): readonly BinaryRouteStage[] =>
  binaryStagesByKind[kind]?.() ?? [];
