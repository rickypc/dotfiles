import { expect, mock, test } from 'bun:test';

import { run, runWhenMain } from '../../scripts/biome-tsc-checker.js';

test('runs the static checker script through injected boundaries', async () => {
  const executor = mock(async () => ({ code: 0, stderr: '', stdout: 'clean' }));
  const write = mock();
  await expect(
    run(
      ['/repo/file.ts'],
      executor,
      '/agents',
      write,
      async () => 'function alpha() {}',
    ),
  ).resolves.toBeUndefined();
  expect(executor).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledWith(
    'biome: passed — clean\ntsc: passed — clean\ndeclaration-order: passed — /repo/file.ts: Top-level declarations are canonical.',
  );
});

test('uses the default source reader when an existing selected path is provided', async () => {
  const executor = mock(async () => ({ code: 0, stderr: '', stdout: 'clean' }));
  const write = mock();
  await expect(
    run(
      ['tests/scripts/biome-tsc-checker.test.ts'],
      executor,
      '/agents',
      write,
    ),
  ).resolves.toBeUndefined();
  expect(write).toHaveBeenCalledTimes(1);
});

test.each([
  [false, 0],
  [true, 1],
])(
  'runs the CLI runner only when the script is main',
  async (isMain, calls) => {
    const runner = mock(async () => undefined);
    await runWhenMain(isMain, ['file.ts'], runner);
    expect(runner).toHaveBeenCalledTimes(calls);
  },
);
