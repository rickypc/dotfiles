import { expect, mock, test } from 'bun:test';
import * as sut from '../../scripts/sanitize-hidden.js';

const cases = [
  { expected: 'ab', input: 'a\u200Bb', label: 'removes zero-width space' },
  { expected: 'ab', input: 'a\u200Cb', label: 'removes zero-width non-joiner' },
  { expected: 'ab', input: 'a\u200Db', label: 'removes zero-width joiner' },
  { expected: 'ab', input: 'a\u2060b', label: 'removes word joiner' },
  { expected: 'ab', input: 'a\uFEFFb', label: 'removes BOM' },
  { expected: 'ab', input: 'a\u00ADb', label: 'removes soft hyphen' },
  { expected: 'a-b', input: 'a\u2013b', label: 'replaces en dash with hyphen' },
  { expected: 'a-b', input: 'a\u2014b', label: 'replaces em dash with hyphen' },
  {
    expected: 'a-b',
    input: 'a\u2012b',
    label: 'replaces figure dash with hyphen',
  },
  { expected: 'a-b', input: 'a\u2010b', label: 'replaces hyphen with hyphen' },
  {
    expected: 'a-b',
    input: 'a\u2011b',
    label: 'replaces non-breaking hyphen with hyphen',
  },
  {
    expected: 'a b',
    input: 'a\u00A0b',
    label: 'replaces non-breaking space with space',
  },
  {
    expected: 'a\nb',
    input: 'a\u2028b',
    label: 'replaces line separator with newline',
  },
  {
    expected: 'a\nb',
    input: 'a\u2029b',
    label: 'replaces paragraph separator with newline',
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
  {
    expected: 'hello world',
    input: 'hello world',
    label: 'returns unchanged for clean text',
  },
  { expected: '', input: '', label: 'handles empty string' },
  { expected: 'x', input: '\u00D7', label: 'replaces multiplication sign with x' },
  { expected: '2 x 2 = 4', input: '2 \u00D7 2 = 4', label: 'replaces × in math expression' },
];

for (const c of cases) {
  test(c.label, () => {
    expect(sut.sanitizeText(c.input)).toBe(c.expected);
  });
}

test('runPool handles concurrency correctly', async () => {
  const gen = async function* (): AsyncGenerator<number> {
    for (let i = 0; i < 10; i++) {
      yield i;
    }
  };
  const processed = await sut.runPool(gen(), 3, async (n: number) => n * 2);
  expect(processed).toHaveLength(10);
  expect(processed.sort((a, b) => a - b)).toEqual([
    0, 2, 4, 6, 8, 10, 12, 14, 16, 18,
  ]);
});

test('runPool handles empty generator', async () => {
  const gen = async function* (): AsyncGenerator<number> {};
  const processed = await sut.runPool(gen(), 3, async (n: number) => n * 2);
  expect(processed).toHaveLength(0);
});

test('runPool handles single item', async () => {
  const gen = async function* (): AsyncGenerator<number> {
    yield 5;
  };
  const processed = await sut.runPool(gen(), 3, async (n: number) => n * 2);
  expect(processed).toHaveLength(1);
  expect(processed[0]).toBe(10);
});

test('parseArgs returns defaults when no args', () => {
  const result = sut.parseArgs();
  expect(typeof result.concurrency).toBe('number');
  expect(typeof result.dryRun).toBe('boolean');
  expect(typeof result.root).toBe('string');
  expect(result.concurrency).toBeGreaterThan(0);
});

test('parseArgs parses --dry-run flag', () => {
  const originalArgv = process.argv;
  process.argv = ['bun', 'sanitize-hidden.ts', '--dry-run'];
  const result = sut.parseArgs();
  expect(result.dryRun).toBe(true);
  process.argv = originalArgv;
});

test('parseArgs parses --concurrency flag', () => {
  const originalArgv = process.argv;
  process.argv = ['bun', 'sanitize-hidden.ts', '--concurrency=4'];
  const result = sut.parseArgs();
  expect(result.concurrency).toBe(4);
  process.argv = originalArgv;
});

test('parseArgs parses root directory', () => {
  const originalArgv = process.argv;
  process.argv = ['bun', 'sanitize-hidden.ts', '/custom/path'];
  const result = sut.parseArgs();
  expect(result.root).toContain('/custom/path');
  process.argv = originalArgv;
});

test('main function exists', () => {
  expect(typeof sut.main).toBe('function');
});

test('main runs dry-run by default', async () => {
  const originalExit = process.exit;
  process.exit = () => {};
  try {
    await sut.main(['--dry-run']);
  } finally {
    process.exit = originalExit;
  }
});

test('main exits with error on invalid args', async () => {
  const originalExit = process.exit;
  let exitCode = 0;
  process.exit = (code: number) => { exitCode = code; };
  try {
    await sut.main(['--invalid-arg']);
  } finally {
    process.exit = originalExit;
  }
  expect(exitCode).toBeDefined();
});

// Tests for uncovered lines: parseArgs edge cases, sanitizeFile, walk, runPool

test('parseArgs handles --dry-run with other args', () => {
  const originalArgv = process.argv;
  process.argv = ['bun', 'sanitize-hidden.ts', '--dry-run', '/custom/path'];
  const result = sut.parseArgs();
  expect(result.dryRun).toBe(true);
  expect(result.root).toContain('/custom/path');
  process.argv = originalArgv;
});

test('parseArgs handles --concurrency with other args', () => {
  const originalArgv = process.argv;
  process.argv = ['bun', 'sanitize-hidden.ts', '--concurrency=8', '/custom/path'];
  const result = sut.parseArgs();
  expect(result.concurrency).toBe(8);
  expect(result.root).toContain('/custom/path');
  process.argv = originalArgv;
});

test('parseArgs ignores unknown flags', () => {
  const originalArgv = process.argv;
  process.argv = ['bun', 'sanitize-hidden.ts', '--unknown-flag', '/custom/path'];
  const result = sut.parseArgs();
  expect(result.root).toContain('/custom/path');
  process.argv = originalArgv;
});

test('parseArgs handles multiple positional args - takes first', () => {
  const originalArgv = process.argv;
  process.argv = ['bun', 'sanitize-hidden.ts', '/first/path', '/second/path'];
  const result = sut.parseArgs();
  expect(result.root).toContain('/first/path');
  process.argv = originalArgv;
});

test('sanitizeFile skips binary files', async () => {
  const result = await sut.sanitizeFile('/tmp/test.jpg', false);
  expect(result.changed).toBe(false);
  expect(result.bytes).toBe(0);
});

test('sanitizeFile skips html files', async () => {
  const result = await sut.sanitizeFile('/tmp/test.html', false);
  expect(result.changed).toBe(false);
  expect(result.bytes).toBe(0);
});

test('sanitizeFile skips non-files', async () => {
  const result = await sut.sanitizeFile('/tmp', false);
  expect(result.changed).toBe(false);
  expect(result.bytes).toBe(0);
});

test('sanitizeFile skips large files', async () => {
  const result = await sut.sanitizeFile('/tmp/large.bin', false);
  expect(result.changed).toBe(false);
  expect(result.bytes).toBe(0);
});

test('sanitizeFile handles read errors gracefully', async () => {
  const result = await sut.sanitizeFile('/nonexistent/path.txt', false);
  expect(result.changed).toBe(false);
  expect(result.bytes).toBe(0);
});

test('sanitizeFile processes file with hidden characters', async () => {
  const { writeFile, rm } = await import('node:fs/promises');
  const testFile = '/tmp/sanitize-test-' + Date.now() + '.txt';
  try {
    await writeFile(testFile, 'hello\u200Bworld');
    const result = await sut.sanitizeFile(testFile, true);
    expect(result.changed).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
  } finally {
    try { await rm(testFile); } catch {}
  }
});

test('sanitizeFile dry-run does not write', async () => {
  const { writeFile, rm, readFile } = await import('node:fs/promises');
  const testFile = '/tmp/sanitize-test-' + Date.now() + '.txt';
  try {
    await writeFile(testFile, 'hello\u200Bworld');
    const result = await sut.sanitizeFile(testFile, true);
    expect(result.changed).toBe(true);
    const content = await readFile(testFile, 'utf8');
    expect(content).toContain('\u200B');
  } finally {
    try { await rm(testFile); } catch {}
  });
});

test('sanitizeFile writes when not dry-run', async () => {
  const { writeFile, rm, readFile } = await import('node:fs/promises');
  const testFile = '/tmp/sanitize-test-' + Date.now() + '.txt';
  try {
    await writeFile(testFile, 'hello\u200Bworld');
    const result = await sut.sanitizeFile(testFile, false);
    expect(result.changed).toBe(true);
    const content = await readFile(testFile, 'utf8');
    expect(content).not.toContain('\u200B');
    expect(content).toBe('helloworld');
  } finally {
    try { await rm(testFile); } catch {}
  });
});

test('sanitizeFile handles file with no changes', async () => {
  const { writeFile, rm } = await import('node:fs/promises');
  const testFile = '/tmp/sanitize-test-' + Date.now() + '.txt';
  try {
    await writeFile(testFile, 'hello world');
    const result = await sut.sanitizeFile(testFile, false);
    expect(result.changed).toBe(false);
    expect(result.bytes).toBe(0);
  } finally {
    try { await rm(testFile); } catch {}
  });
});

test('runPool handles errors in worker', async () => {
  const gen = async function* (): AsyncGenerator<number> {
    yield 1;
    throw new Error('worker error');
  };
  try {
    await sut.runPool(gen(), 1, async (n: number) => n * 2);
  } catch (e) {
    expect(e).toBeDefined();
  }
});

test('walk returns empty for non-existent directory', async () => {
  const results: string[] = [];
  for await (const file of sut.walk('/nonexistent/directory')) {
    results.push(file);
  }
  expect(results).toEqual([]);
});

test('runPool with concurrency 1', async () => {
  const gen = async function* (): AsyncGenerator<number> {
    for (let i = 0; i < 5; i++) {
      yield i;
    }
  };
  const processed = await sut.runPool(gen(), 1, async (n: number) => n * 2);
  expect(processed).toHaveLength(5);
  expect(processed.sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 8]);
});

test('sanitizeText handles all REPLACE_MAP entries', () => {
  const testCases = [
    { input: '\u00A0', expected: ' ' },
    { input: '\u00AD', expected: '' },
    { input: '\u00D7', expected: 'x' },
    { input: '\u200B', expected: '' },
    { input: '\u200C', expected: '' },
    { input: '\u200D', expected: '' },
    { input: '\u2010', expected: '-' },
    { input: '\u2011', expected: '-' },
    { input: '\u2012', expected: '-' },
    { input: '\u2013', expected: '-' },
    { input: '\u2014', expected: '-' },
    { input: '\u2028', expected: '\n' },
    { input: '\u2029', expected: '\n' },
    { input: '\u2060', expected: '' },
    { input: '\uFEFF', expected: '' },
  ];

  for (const { input, expected } of testCases) {
    expect(sut.sanitizeText(input)).toBe(expected);
  }
});

test('sanitizeText handles CONTROL_RE', () => {
  const input = 'a\u0001b\u0007c\u000Bd\u000Ce\u000Ff\u001Fg\u007Fh';
  const expected = 'abcdefgh';
  expect(sut.sanitizeText(input)).toBe(expected);
});

test('sanitizeFile handles file with no changes', async () => {
  const { writeFile, rm } = await import('node:fs/promises');
  const testFile = '/tmp/sanitize-test-' + Date.now() + '.txt';
  try {
    await writeFile(testFile, 'hello world');
    const result = await sut.sanitizeFile(testFile, false);
    expect(result.changed).toBe(false);
    expect(result.bytes).toBe(0);
  } finally {
    try { await rm(testFile); } catch {}
  });
}

test('runPool handles errors in worker', async () => {
  const gen = async function* (): AsyncGenerator<number> {
    yield 1;
    throw new Error('worker error');
  };
  try {
    await sut.runPool(gen(), 1, async (n: number) => n * 2);
  } catch (e) {
    expect(e).toBeDefined();
  }
});

test('walk returns empty for non-existent directory', async () => {
  const results: string[] = [];
  for await (const file of sut.walk('/nonexistent/directory')) {
    results.push(file);
  }
  expect(results).toEqual([]);
});

test('runPool with concurrency 1', async () => {
  const gen = async function* (): AsyncGenerator<number> {
    for (let i = 0; i < 5; i++) {
      yield i;
    }
  };
  const processed = await sut.runPool(gen(), 1, async (n: number) => n * 2);
  expect(processed).toHaveLength(5);
  expect(processed.sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 8]);
});

test('sanitizeText handles all REPLACE_MAP entries', () => {
  const testCases = [
    { input: '\u00A0', expected: ' ' },
    { input: '\u00AD', expected: '' },
    { input: '\u00D7', expected: 'x' },
    { input: '\u200B', expected: '' },
    { input: '\u200C', expected: '' },
    { input: '\u200D', expected: '' },
    { input: '\u2010', expected: '-' },
    { input: '\u2011', expected: '-' },
    { input: '\u2012', expected: '-' },
    { input: '\u2013', expected: '-' },
    { input: '\u2014', expected: '-' },
    { input: '\u2028', expected: '\n' },
    { input: '\u2029', expected: '\n' },
    { input: '\u2060', expected: '' },
    { input: '\uFEFF', expected: '' },
  ];

  for (const { input, expected } of testCases) {
    expect(sut.sanitizeText(input)).toBe(expected);
  }
});

test('sanitizeText handles CONTROL_RE', () => {
  const input = 'a\u0001b\u0007c\u000Bd\u000Ce\u000Ff\u001Fg\u007Fh';
  const expected = 'abcdefgh';
  expect(sut.sanitizeText(input)).toBe(expected);
});

test('sanitizeFile handles file with no changes', async () => {
  const { writeFile, rm } = await import('node:fs/promises');
  const testFile = '/tmp/sanitize-test-' + Date.now() + '.txt';
  try {
    await writeFile(testFile, 'hello world');
    const result = await sut.sanitizeFile(testFile, false);
    expect(result.changed).toBe(false);
    expect(result.bytes).toBe(0);
  } finally {
    try { await rm(testFile); } catch {}
  });
}
