import { expect, mock, test } from 'bun:test';

import type { CommandSpec } from '../../utils/contracts.js';
import {
  commandText,
  fallbackQueryTokens,
  rgFilesCommand,
  rgLiteralCommand,
  skippedRgAttempts,
  stagedRgSearch,
} from '../../utils/search-fallback.js';

test('builds the shared literal and file-name rg commands', () => {
  const defaultGlobs = [
    '--glob',
    '!**/.git/**',
    '--glob',
    '!**/node_modules/**',
    '--glob',
    '!**/build/**',
    '--glob',
    '!**/coverage/**',
    '--glob',
    '!**/dist/**',
  ];
  expect(rgLiteralCommand('/repo', 'Needle', false)).toEqual({
    args: [
      '--color',
      'never',
      '--context',
      '2',
      '--line-number',
      '--fixed-strings',
      '--hidden',
      ...defaultGlobs,
      'Needle',
      '/repo',
    ],
    command: 'rg',
  });
  expect(rgLiteralCommand('/repo', 'Needle', true).args).toContain('--ignore-case');
  expect(rgFilesCommand('/repo').args).toEqual(['--files', '--hidden', ...defaultGlobs, '/repo']);
  expect(skippedRgAttempts('/repo', 'Needle', 'found')).toHaveLength(3);
  expect(
    commandText({
      args: [],
      command: 'tool',
      environment: { A_FIRST: 'a', Z_LAST: 'z' },
    }),
  ).toBe('A_FIRST=a Z_LAST=z tool');
});

test('the raw escape restores the unfiltered ignore-transparent sweep', () => {
  const rawLiteral = rgLiteralCommand('/repo', 'Needle', false, true).args;
  const rawFiles = rgFilesCommand('/repo', true).args;
  for (const args of [rawLiteral, rawFiles]) {
    expect(args).toContain('--hidden');
    expect(args).toContain('--no-ignore');
  }
  expect(rawLiteral).not.toContain('!**/coverage/**');
  expect(rawFiles).not.toContain('!**/dist/**');
});

test('stops after a literal match and records skipped strategies', async () => {
  const commands: string[] = [];
  // CommandExecutor is the process-spawning boundary; every test injects a mock executor.
  const receipt = await stagedRgSearch(
    mock(async (spec: CommandSpec) => {
      commands.push(spec.args[0] ?? '');
      return { code: 0, stderr: '', stdout: '/repo/file.ts:3:Needle' };
    }),
    '/repo',
    'Needle',
  );
  expect(commands).toEqual(['--color']);
  expect(receipt).toMatchObject({
    found: true,
    output: '/repo/file.ts:3:Needle',
  });
  expect(receipt.attempts.map((item) => item.status)).toEqual(['found', 'skipped', 'skipped']);
});

test('tries case-insensitive content after an exact miss', async () => {
  const outputs = [
    { code: 1, stderr: '', stdout: '' },
    { code: 0, stderr: '', stdout: '/repo/file.ts:3:needle' },
  ];
  const receipt = await stagedRgSearch(
    mock(async () => outputs.shift() ?? { code: 1, stderr: '', stdout: '' }),
    '/repo',
    'Needle',
  );
  expect(receipt.found).toBeTrue();
  expect(receipt.attempts.map((item) => item.status)).toEqual(['not-found', 'found', 'skipped']);
});

test('preserves contextual rg output without color codes', async () => {
  const receipt = await stagedRgSearch(
    mock(async () => ({
      code: 0,
      stderr: '',
      stdout: '/repo/file.ts-1-before\n/repo/file.ts:2:Needle\n/repo/file.ts-3-after',
    })),
    '/repo',
    'Needle',
  );
  expect(receipt.output).toContain('/repo/file.ts-1-before');
  expect(receipt.output).toContain('/repo/file.ts:2:Needle');
  expect(receipt.output).not.toContain('\u001b[');
});

test('tries file-name discovery after content misses and records command errors', async () => {
  const outputs = [
    { code: 1, stderr: '', stdout: '' },
    { code: 2, stderr: 'bad regex', stdout: '' },
    { code: 0, stderr: '', stdout: '/repo/needle-file.ts\n/repo/other.ts' },
  ];
  const receipt = await stagedRgSearch(
    mock(async () => outputs.shift() ?? { code: 1, stderr: '', stdout: '' }),
    '/repo',
    'needle',
  );
  expect(receipt).toMatchObject({
    found: true,
    output: '/repo/needle-file.ts',
  });
  expect(receipt.attempts.map((item) => item.status)).toEqual(['not-found', 'error', 'found']);
  await expect(
    stagedRgSearch(
      mock(async () => {
        throw new Error('unavailable');
      }),
      '/repo',
      'needle',
    ),
  ).resolves.toMatchObject({ found: false });
  await expect(
    stagedRgSearch(
      mock(async () => ({ code: 1, stderr: '', stdout: '' })),
      'relative',
      'needle',
    ),
  ).rejects.toThrow('absolute');
  await expect(
    stagedRgSearch(
      mock(async () => ({ code: 1, stderr: '', stdout: '' })),
      '/repo',
      ' ',
    ),
  ).rejects.toThrow('query');
});

test('does not treat stderr-only diagnostics as a content match', async () => {
  const receipt = await stagedRgSearch(
    mock(async () => ({ code: 0, stderr: 'warning: ignored path', stdout: '' })),
    '/repo',
    'needle',
  );
  expect(receipt.found).toBeFalse();
  expect(receipt.output).toBe('');
  expect(receipt.attempts[0]).toMatchObject({
    detail: 'warning: ignored path',
    status: 'not-found',
  });
});

test('staged rg commands stay hidden-transparent and exclude the preconfigured dirs', () => {
  const literal = rgLiteralCommand('/repo', 'Needle', false).args;
  const insensitive = rgLiteralCommand('/repo', 'Needle', true).args;
  const files = rgFilesCommand('/repo').args;
  for (const args of [literal, insensitive, files]) {
    expect(args).toContain('--hidden');
    expect(args).not.toContain('--no-ignore');
    for (const glob of ['!**/coverage/**', '!**/dist/**', '!**/build/**']) {
      expect(args).toContain(glob);
    }
  }
  const receipts = skippedRgAttempts('/repo', 'Needle', 'Skipped for the test.');
  expect(receipts).toHaveLength(3);
  for (const attempt of receipts) {
    expect(attempt.command).toContain('--hidden');
    expect(attempt.command).not.toContain('--no-ignore');
  }
});

test('tokenizes the fallback query into unique lowercase non-whole tokens', () => {
  expect(fallbackQueryTokens('something blueberry in some pancake')).toEqual([
    'something',
    'blueberry',
    'in',
    'some',
    'pancake',
  ]);
  expect(fallbackQueryTokens('  Blueberry   blueberry ')).toEqual(['blueberry']);
  expect(fallbackQueryTokens('notosansmono')).toEqual([]);
});

test('a long-token tier-one hit never runs the sub-3-character tier', async () => {
  const executor = mock(async (spec: CommandSpec) => {
    if (spec.args.includes('rg-token:blueberry') || spec.args.includes('blueberry')) {
      return { code: 0, stderr: '', stdout: '/repo/b.ts:1:blueberry' };
    }
    return { code: 1, stderr: '', stdout: '' };
  });
  const receipt = await stagedRgSearch(executor, '/repo', 'blueberry in');
  expect(receipt.found).toBeTrue();
  expect(receipt.slots).toEqual([{ keyword: 'blueberry', output: '/repo/b.ts:1:blueberry' }]);
  expect(receipt.output).toBe('/repo/b.ts:1:blueberry');
  expect(receipt.attempts.map((item) => item.strategy)).toEqual([
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-token:blueberry',
  ]);
  expect(executor).toHaveBeenCalledTimes(3);
});

test('sub-3-character tokens run only after every longer slot misses', async () => {
  const executor = mock(async (spec: CommandSpec) => {
    if (spec.args[0] === '--files') {
      return { code: 0, stderr: '', stdout: '/repo/in zz/zz-file.ts' };
    }
    return { code: 1, stderr: '', stdout: '' };
  });
  const receipt = await stagedRgSearch(executor, '/repo', 'in zz');
  expect(receipt.found).toBeTrue();
  expect(receipt.slots).toEqual([]);
  expect(receipt.attempts.map((item) => item.strategy)).toEqual([
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-token:in',
    'rg-token:zz',
    'rg-files',
  ]);
});

test('a single-token query skips duplicate token slots and answers from file names', async () => {
  const executor = mock(async (spec: CommandSpec) => {
    if (spec.args[0] === '--files') {
      return { code: 0, stderr: '', stdout: '/repo/needle-file.ts' };
    }
    return { code: 1, stderr: '', stdout: '' };
  });
  const receipt = await stagedRgSearch(executor, '/repo', 'needle');
  expect(receipt.found).toBeTrue();
  expect(receipt.slots).toEqual([]);
  expect(receipt.attempts.map((item) => item.strategy)).toEqual([
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-files',
  ]);
});

test('a tier-two token hit is tagged with its keyword', async () => {
  const executor = mock(async (spec: CommandSpec) => {
    if (spec.args.includes('zz')) {
      return { code: 0, stderr: '', stdout: '/repo/x.ts:2:zz' };
    }
    return { code: 1, stderr: '', stdout: '' };
  });
  const receipt = await stagedRgSearch(executor, '/repo', 'in zz');
  expect(receipt.found).toBeTrue();
  expect(receipt.slots).toEqual([{ keyword: 'zz', output: '/repo/x.ts:2:zz' }]);
  expect(receipt.attempts.map((item) => item.strategy)).toEqual([
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-token:in',
    'rg-token:zz',
  ]);
});

test('every tier-one token slot runs and each hit carries its own keyword', async () => {
  const executor = mock(async (spec: CommandSpec) => {
    if (spec.args.includes('custom') || spec.args.includes('module')) {
      const keyword = spec.args.includes('custom') ? 'custom' : 'module';
      return { code: 0, stderr: '', stdout: `/repo/${keyword}.ts:1:${keyword}` };
    }
    return { code: 1, stderr: '', stdout: '' };
  });
  const receipt = await stagedRgSearch(executor, '/repo', 'custom module');
  expect(receipt.found).toBeTrue();
  expect(receipt.slots).toEqual([
    { keyword: 'custom', output: '/repo/custom.ts:1:custom' },
    { keyword: 'module', output: '/repo/module.ts:1:module' },
  ]);
  expect(receipt.output).toBe('/repo/custom.ts:1:custom\n/repo/module.ts:1:module');
  expect(receipt.attempts.map((item) => item.strategy)).toEqual([
    'rg-literal',
    'rg-literal-ignore-case',
    'rg-token:custom',
    'rg-token:module',
  ]);
});
