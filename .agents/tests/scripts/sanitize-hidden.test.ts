import { afterAll, expect, mock, test } from 'bun:test';

type SpawnMode = 'broken' | 'normal' | 'throw';

const realFileSystem = await import('node:fs/promises');
const realPath = await import('node:path');
const realProcess = await import('node:process');
const cliArgv = ['bun', 'sanitize-hidden.ts'];
const exitCodes: Array<string | number | null | undefined> = [];
const fileContents = new Map<string, string | Uint8Array>();
const fileStats = new Map<string, { isFile: () => boolean; size: number }>();
const virtualRoot = '/virtual-sanitize';
const log = mock();
const error = mock();
const cwd = mock(() => '/workspace');
const exit = mock((code?: string | number | null) => {
  exitCodes.push(code);
  return undefined as never;
});
const resolvePath = mock((value: string) =>
  value.startsWith('/') ? value : realPath.resolve(value),
);
const readFile = mock(async (file: string) => {
  if (!file.startsWith(virtualRoot)) {
    return realFileSystem.readFile(file);
  }
  const content = fileContents.get(file);
  if (content === undefined) {
    throw new Error(`Missing file: ${file}`);
  }
  return content;
});
const stat = mock(async (file: string) => {
  if (!file.startsWith(virtualRoot)) {
    return realFileSystem.stat(file);
  }
  const value = fileStats.get(file);
  if (!value) {
    throw new Error(`Missing stat: ${file}`);
  }
  return value;
});
const writeFile = mock(async (file: string, content: string, _encoding: 'utf8') => {
  if (!file.startsWith(virtualRoot)) {
    await realFileSystem.writeFile(file, content, 'utf8');
    return;
  }
  fileContents.set(file, content);
});

mock.module('node:fs/promises', () => ({
  ...realFileSystem,
  readFile,
  stat,
  writeFile,
}));
mock.module('node:path', () => ({ ...realPath, resolve: resolvePath }));
mock.module('node:process', () => ({
  ...realProcess,
  argv: cliArgv,
  cwd,
  exit,
}));

let spawnMode: SpawnMode = 'broken';
let spawnOutput = '';
const spawn = mock(() => {
  if (spawnMode === 'throw') {
    throw new Error('spawn failed');
  }
  if (spawnMode === 'broken') {
    return {
      exited: Promise.resolve(1),
      stdout: {
        getReader: () => {
          throw new Error('reader failed');
        },
      },
    } as unknown as ReturnType<typeof Bun.spawn>;
  }
  let read = false;
  const reader = {
    read: mock(async () => {
      if (read) {
        return { done: true, value: undefined };
      }
      read = true;
      return {
        done: false,
        value: new TextEncoder().encode(spawnOutput),
      };
    }),
  };
  return {
    exited: Promise.resolve(0),
    stdout: { getReader: () => reader },
  } as unknown as ReturnType<typeof Bun.spawn>;
});

const originalSpawn = Bun.spawn;
const originalLog = console.log;
const originalError = console.error;
Bun.spawn = spawn as typeof Bun.spawn;
console.log = log;
console.error = error;

const sut = await import('../../scripts/sanitize-hidden.js');
await Promise.resolve();
spawnMode = 'normal';
exitCodes.length = 0;
log.mockClear();
error.mockClear();

afterAll(() => {
  Bun.spawn = originalSpawn;
  console.log = originalLog;
  console.error = originalError;
});

const clearFiles = (): void => {
  fileContents.clear();
  fileStats.clear();
};

const setArgv = (...values: string[]): void => {
  cliArgv.splice(0, cliArgv.length, ...values);
};

const setBinaryFile = (file: string, bytes: Uint8Array): void => {
  fileContents.set(file, bytes);
  fileStats.set(file, { isFile: () => true, size: bytes.length });
};

const setFile = (file: string, content: string, size = content.length): void => {
  fileContents.set(file, content);
  fileStats.set(file, { isFile: () => true, size });
};

const sanitizeCases = [
  { expected: 'ab', input: 'a\u200Bb', label: 'removes zero-width space' },
  {
    expected: 'ab',
    input: 'a\u200Cb',
    label: 'removes zero-width non-joiner',
  },
  { expected: 'ab', input: 'a\u200Db', label: 'removes zero-width joiner' },
  { expected: 'ab', input: 'a\u2060b', label: 'removes word joiner' },
  { expected: 'ab', input: 'a\uFEFFb', label: 'removes BOM' },
  { expected: 'ab', input: 'a\u00ADb', label: 'removes soft hyphen' },
  { expected: 'a-b', input: 'a\u2013b', label: 'replaces en dash' },
  { expected: 'a-b', input: 'a\u2014b', label: 'replaces em dash' },
  { expected: 'a-b', input: 'a\u2012b', label: 'replaces figure dash' },
  { expected: 'a-b', input: 'a\u2010b', label: 'replaces hyphen' },
  {
    expected: 'a-b',
    input: 'a\u2011b',
    label: 'replaces non-breaking hyphen',
  },
  { expected: 'a b', input: 'a\u00A0b', label: 'replaces non-breaking space' },
  { expected: 'a\nb', input: 'a\u2028b', label: 'replaces line separator' },
  {
    expected: 'a\nb',
    input: 'a\u2029b',
    label: 'replaces paragraph separator',
  },
  {
    expected: 'abc',
    input: 'a\u0001b\u0007c',
    label: 'removes control characters',
  },
  {
    expected: '- \n',
    input: '\u200B\u2014\u00A0\u2028',
    label: 'handles multiple replacements',
  },
  { expected: 'hello world', input: 'hello world', label: 'keeps clean text' },
  { expected: '', input: '', label: 'handles empty text' },
  { expected: 'x', input: '\u00D7', label: 'replaces multiplication sign' },
  {
    expected: 'a"b',
    input: 'a\u201Cb',
    label: 'replaces left double quotation mark',
  },
  {
    expected: 'a"b',
    input: 'a\u201Db',
    label: 'replaces right double quotation mark',
  },
  {
    expected: 'a"b',
    input: 'a\u201Eb',
    label: 'replaces double low-9 quotation mark',
  },
  {
    expected: 'a"b',
    input: 'a\u201Fb',
    label: 'replaces double high-reversed-9 quotation mark',
  },
  { expected: 'a"b', input: 'a\u2033b', label: 'replaces double prime' },
  {
    expected: 'a"b',
    input: 'a\u2036b',
    label: 'replaces reversed double prime',
  },
  {
    expected: 'a"b',
    input: 'a\u301Db',
    label: 'replaces reversed double prime quotation mark',
  },
  {
    expected: 'a"b',
    input: 'a\u301Eb',
    label: 'replaces double prime quotation mark',
  },
  {
    expected: 'a"b',
    input: 'a\u301Fb',
    label: 'replaces low double prime quotation mark',
  },
  {
    expected: 'a"b',
    input: 'a\uFF02b',
    label: 'replaces fullwidth quotation mark',
  },
];

test.each(sanitizeCases)('$label', ({ input, expected }) => {
  expect(sut.sanitizeText(input)).toBe(expected);
});

test('leaves angle quotation marks (guillemets) untouched', () => {
  expect(sut.sanitizeText('a\u00ABb')).toBe('a\u00ABb');
  expect(sut.sanitizeText('a\u00BBb')).toBe('a\u00BBb');
});

test('leaves a Sinhala line untouched, including its zero-width joiner', () => {
  const sinhala = '\u0db4\u0dca\u200d\u0dbb\u0da5\u0dcf';
  expect(sut.sanitizeText(`${sinhala} \u2014 \u00A0`)).toBe(`${sinhala} \u2014 \u00A0`);
});

test('still sanitizes lines that contain no Sinhala script', () => {
  expect(sut.sanitizeText('a\u200db \u2014')).toBe('ab -');
});

test('sanitizes only the non-Sinhala lines of a multi-line input', () => {
  const sinhala = '\u0d9a\u0dca\u200d\u0dbb';
  expect(sut.sanitizeText(`${sinhala}\na\u200db \u2014`)).toBe(`${sinhala}\nab -`);
});

test.each([
  {
    bytes: new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]),
    expected: false,
    label: 'plain UTF-8 text is not binary',
  },
  { bytes: new Uint8Array([0x61, 0x00, 0x62]), expected: true, label: 'NUL byte marks binary' },
  { bytes: new Uint8Array([0xc3, 0x28]), expected: true, label: 'invalid UTF-8 marks binary' },
  {
    bytes: new Uint8Array([0xe2, 0x80, 0x94]),
    expected: false,
    label: 'valid multi-byte UTF-8 is not binary',
  },
])('isBinaryBuffer: $label', ({ bytes, expected }) => {
  expect(sut.isBinaryBuffer(bytes)).toBe(expected);
});

test('parseArgs uses safe dry-run defaults', () => {
  setArgv('bun', 'sanitize-hidden.ts');

  expect(sut.parseArgs()).toEqual({
    concurrency: 16,
    dryRun: true,
    help: false,
    root: '/workspace',
  });
});

test('parseArgs requires --write to leave dry-run mode', () => {
  setArgv('bun', 'sanitize-hidden.ts', '--write');

  expect(sut.parseArgs()).toEqual({
    concurrency: 16,
    dryRun: false,
    help: false,
    root: '/workspace',
  });
});

test('parseArgs honors the last dry-run/write flag and help flags', () => {
  setArgv('bun', 'sanitize-hidden.ts', '--write', '--dry-run', '--concurrency=4');
  expect(sut.parseArgs()).toEqual({
    concurrency: 4,
    dryRun: true,
    help: false,
    root: '/workspace',
  });

  setArgv('bun', 'sanitize-hidden.ts', '--help');
  expect(sut.parseArgs()).toMatchObject({ help: true });
  setArgv('bun', 'sanitize-hidden.ts', '-h');
  expect(sut.parseArgs()).toMatchObject({ help: true });
});

test('parseArgs covers flags and positional argument precedence', () => {
  setArgv(
    'bun',
    'sanitize-hidden.ts',
    '--dry-run',
    '--concurrency=8',
    '--unknown-flag',
    '/first/path',
    '/second/path',
  );

  expect(sut.parseArgs()).toEqual({
    concurrency: 8,
    dryRun: true,
    help: false,
    root: '/first/path',
  });
  setArgv('bun', 'sanitize-hidden.ts');
});

test.each(['/tmp/test.jpg', '/tmp/test.HTML', '/tmp/test.avif', '/tmp/test.WOFF2'])(
  'sanitizeFile skips excluded extension %s',
  async (file) => {
    stat.mockClear();
    const result = await sut.sanitizeFile(file, false);
    expect(result).toEqual({ bytes: 0, changed: false, file });
    expect(stat).not.toHaveBeenCalled();
  },
);

test('sanitizeFile skips binary content even with a text extension', async () => {
  setBinaryFile(`${virtualRoot}/image.png.txt`, new Uint8Array([0x61, 0x00, 0x62]));
  setBinaryFile(`${virtualRoot}/font.woff2.txt`, new Uint8Array([0xc3, 0x28]));
  writeFile.mockClear();

  await expect(sut.sanitizeFile(`${virtualRoot}/image.png.txt`, false)).resolves.toEqual({
    bytes: 0,
    changed: false,
    file: `${virtualRoot}/image.png.txt`,
  });
  await expect(sut.sanitizeFile(`${virtualRoot}/font.woff2.txt`, false)).resolves.toEqual({
    bytes: 0,
    changed: false,
    file: `${virtualRoot}/font.woff2.txt`,
  });
  expect(writeFile).not.toHaveBeenCalled();
});

test('sanitizeFile skips non-files, oversized files, and read failures', async () => {
  fileStats.set(`${virtualRoot}/directory`, { isFile: () => false, size: 0 });
  fileStats.set(`${virtualRoot}/large.txt`, {
    isFile: () => true,
    size: 16 * 1024 * 1024 + 1,
  });

  await expect(sut.sanitizeFile(`${virtualRoot}/directory`, false)).resolves.toEqual({
    bytes: 0,
    changed: false,
    file: `${virtualRoot}/directory`,
  });
  await expect(sut.sanitizeFile(`${virtualRoot}/large.txt`, false)).resolves.toEqual({
    bytes: 0,
    changed: false,
    file: `${virtualRoot}/large.txt`,
  });
  await expect(sut.sanitizeFile(`${virtualRoot}/missing.txt`, false)).resolves.toEqual({
    bytes: 0,
    changed: false,
    file: `${virtualRoot}/missing.txt`,
  });
});

test('sanitizeFile preserves clean files and dry-run changes', async () => {
  setFile(`${virtualRoot}/clean.txt`, 'hello world');
  setFile(`${virtualRoot}/dry-run.txt`, 'hello\u200Bworld');
  writeFile.mockClear();

  await expect(sut.sanitizeFile(`${virtualRoot}/clean.txt`, false)).resolves.toEqual({
    bytes: 0,
    changed: false,
    file: `${virtualRoot}/clean.txt`,
  });
  await expect(sut.sanitizeFile(`${virtualRoot}/dry-run.txt`, true)).resolves.toEqual({
    bytes: 1,
    changed: true,
    file: `${virtualRoot}/dry-run.txt`,
  });
  expect(fileContents.get(`${virtualRoot}/dry-run.txt`)).toBe('hello\u200Bworld');
  expect(writeFile).not.toHaveBeenCalled();
});

test('sanitizeFile writes changed content when not in dry-run mode', async () => {
  setFile(`${virtualRoot}/write.txt`, 'hello\u200Bworld');
  writeFile.mockClear();

  await expect(sut.sanitizeFile(`${virtualRoot}/write.txt`, false)).resolves.toEqual({
    bytes: 1,
    changed: true,
    file: `${virtualRoot}/write.txt`,
  });
  expect(writeFile).toHaveBeenCalledWith(`${virtualRoot}/write.txt`, 'helloworld', 'utf8');
  expect(fileContents.get(`${virtualRoot}/write.txt`)).toBe('helloworld');
});

test('walk yields newline-delimited output and final buffered output', async () => {
  spawnOutput = 'first.txt\n\nsecond.txt';
  const files: string[] = [];
  for await (const file of sut.walk('/workspace')) {
    files.push(file);
  }

  expect(files).toEqual(['first.txt', 'second.txt']);
  expect(spawn).toHaveBeenCalledWith(
    expect.arrayContaining(['rg', '--files-with-matches', '-g', '!node_modules', '/workspace']),
    expect.anything(),
  );
  expect(spawn).not.toHaveBeenCalledWith(
    expect.arrayContaining(['--no-ignore-vcs']),
    expect.anything(),
  );
});

test('walk returns empty when spawn fails', async () => {
  spawnMode = 'throw';
  const files: string[] = [];
  for await (const file of sut.walk('/workspace')) {
    files.push(file);
  }
  spawnMode = 'normal';

  expect(files).toEqual([]);
});

test('runPool waits for full slots and preserves all results', async () => {
  const gen = async function* (): AsyncGenerator<string> {
    yield 'a';
    yield 'b';
    yield 'c';
  };

  let release = (): void => undefined;
  let started = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const result = sut.runPool(gen(), 2, async (value) => {
    started += 1;
    await gate;
    return value.toUpperCase();
  });
  while (started < 2) {
    await Promise.resolve();
  }
  release();

  await expect(result).resolves.toEqual(['A', 'B', 'C']);
});

test('runPool propagates worker failures', async () => {
  const gen = async function* (): AsyncGenerator<string> {
    yield 'a';
    throw new Error('worker failed');
  };

  await expect(sut.runPool(gen(), 1, async (value) => value.toUpperCase())).rejects.toThrow(
    'worker failed',
  );
});

test('main requires --write to modify files and warns in write mode', async () => {
  clearFiles();
  spawnOutput = `${virtualRoot}/changed.txt\n`;
  setFile(`${virtualRoot}/changed.txt`, 'hello\u200Bworld');
  setArgv('bun', 'sanitize-hidden.ts', virtualRoot, '--write', '--concurrency=1');
  log.mockClear();
  writeFile.mockClear();

  await sut.main();

  expect(log).toHaveBeenCalledWith('[sanitize] WRITE mode - files will be modified in place');
  expect(log).toHaveBeenCalledWith(expect.stringContaining('[sanitize] 1 file(s) changed'));
  expect(log).toHaveBeenCalledWith('  changed.txt  (-1 bytes)');
  expect(writeFile).toHaveBeenCalled();
});

test('main defaults to dry-run and never writes without --write', async () => {
  clearFiles();
  spawnOutput = `${virtualRoot}/changed.txt\n`;
  setFile(`${virtualRoot}/changed.txt`, 'hello\u200Bworld');
  setArgv('bun', 'sanitize-hidden.ts', virtualRoot, '--concurrency=1');
  log.mockClear();
  writeFile.mockClear();

  await sut.main();

  expect(log).toHaveBeenCalledWith(
    expect.stringContaining('[sanitize] dry-run - 1 file(s) would change'),
  );
  expect(writeFile).not.toHaveBeenCalled();
  setArgv('bun', 'sanitize-hidden.ts');
});

test('main prints usage for --help without scanning', async () => {
  clearFiles();
  setArgv('bun', 'sanitize-hidden.ts', '--help');
  log.mockClear();
  spawn.mockClear();

  await sut.main();

  expect(log).toHaveBeenCalledWith(expect.stringContaining('--write'));
  expect(spawn).not.toHaveBeenCalled();
  setArgv('bun', 'sanitize-hidden.ts');
});

test('main reports when no files need changes', async () => {
  clearFiles();
  spawnOutput = '';
  setArgv('bun', 'sanitize-hidden.ts', virtualRoot);
  log.mockClear();

  await sut.main();

  expect(log).toHaveBeenCalledWith('  (no changes needed - all clean)');
  setArgv('bun', 'sanitize-hidden.ts');
});

test('main rejects fatal walk errors after the CLI catch boundary is covered', async () => {
  spawnMode = 'broken';
  await expect(sut.main()).rejects.toThrow('reader failed');
  spawnMode = 'normal';
});
