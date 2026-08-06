import { expect, mock, test } from 'bun:test';

import {
  lintCommandsFor,
  lintExitCode,
  runLintCommands,
  writeLintDiagnostics,
} from '../../utils/lint.js';

test('defines the distinct lint commands under one agents root', () => {
  const commands = lintCommandsFor('/agents');
  expect(commands.map(({ name }) => name)).toEqual([
    'biome',
    'declaration-order',
    'skills',
  ]);
  expect(commands.every(({ spec }) => spec.cwd === '/agents')).toBe(true);
  expect(commands[1]?.spec.args.join(' ')).toContain(
    '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}',
  );
  expect(commands[2]?.spec.args.join(' ')).toContain(
    'scripts/validate-skills.ts',
  );
});

test('runs distinct lint commands together and preserves every command result', async () => {
  let releaseBiome:
    | ((value: { code: number; stderr: string; stdout: string }) => void)
    | undefined;
  const biome = new Promise<{ code: number; stderr: string; stdout: string }>(
    (resolve) => {
      releaseBiome = resolve;
    },
  );
  let started = 0;
  const executor = mock(async ({ args }: { args: readonly string[] }) => {
    started += 1;
    return args.join(' ').includes('biome')
      ? biome
      : { code: 0, stderr: '', stdout: `${started}` };
  });
  const receipts = runLintCommands(executor, '/agents');
  expect(started).toBe(3);
  releaseBiome?.({ code: 0, stderr: '', stdout: 'biome' });
  await expect(receipts).resolves.toHaveLength(3);
});

test('replays command output without converting failures into replacement errors', () => {
  const write = mock();
  const receipts = [
    {
      name: 'biome' as const,
      result: { code: 0, stderr: 'biome stderr', stdout: 'biome stdout' },
    },
    {
      name: 'declaration-order' as const,
      result: {
        code: 4,
        stderr: 'declaration-order stderr',
        stdout: 'declaration-order stdout',
      },
    },
  ];
  writeLintDiagnostics(receipts, write);
  expect(write.mock.calls).toEqual([
    ['biome stdout'],
    ['biome stderr'],
    ['declaration-order stdout'],
    ['declaration-order stderr'],
  ]);
  expect(lintExitCode(receipts)).toBe(4);
});
