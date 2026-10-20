import { expect, mock, test } from 'bun:test';

import type { CommandSpec } from '../../utils/contracts.js';
import {
  commandText,
  rgFilesCommand,
  rgLiteralCommand,
  skippedRgAttempts,
  stagedRgSearch,
} from '../../utils/search-fallback.js';

test('builds the shared literal and file-name rg commands', () => {
  expect(rgLiteralCommand('/repo', 'Needle', false)).toEqual({
    args: [
      '--color',
      'never',
      '--context',
      '2',
      '--line-number',
      '--fixed-strings',
      '--hidden',
      '--no-ignore',
      '--glob',
      '!**/.git/**',
      '--glob',
      '!**/node_modules/**',
      'Needle',
      '/repo',
    ],
    command: 'rg',
  });
  expect(rgLiteralCommand('/repo', 'Needle', true).args).toContain('--ignore-case');
  expect(rgFilesCommand('/repo').args).toEqual([
    '--files',
    '--hidden',
    '--no-ignore',
    '--glob',
    '!**/.git/**',
    '--glob',
    '!**/node_modules/**',
    '/repo',
  ]);
  expect(skippedRgAttempts('/repo', 'Needle', 'found')).toHaveLength(3);
  expect(
    commandText({
      args: [],
      command: 'tool',
      environment: { A_FIRST: 'a', Z_LAST: 'z' },
    }),
  ).toBe('A_FIRST=a Z_LAST=z tool');
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

test('staged rg commands stay ignore-transparent under the approved root', () => {
  const literal = rgLiteralCommand('/repo', 'Needle', false).args;
  const insensitive = rgLiteralCommand('/repo', 'Needle', true).args;
  const files = rgFilesCommand('/repo').args;
  for (const args of [literal, insensitive, files]) {
    expect(args).toContain('--hidden');
    expect(args).toContain('--no-ignore');
  }
  const receipts = skippedRgAttempts('/repo', 'Needle', 'Skipped for the test.');
  expect(receipts).toHaveLength(3);
  for (const attempt of receipts) {
    expect(attempt.command).toContain('--hidden');
    expect(attempt.command).toContain('--no-ignore');
  }
});
