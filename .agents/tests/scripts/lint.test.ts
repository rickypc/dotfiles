import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/lint.js';

test('sets a nonzero exit code after replaying every failed command diagnostic', async () => {
  const executor = mock(async ({ args }: { args: readonly string[] }) => ({
    code: args.join(' ').includes('biome') ? 1 : 0,
    stderr: '',
    stdout: args.join(' '),
  }));
  const write = mock();
  const setExitCode = mock();
  await run([], executor, '/agents', write, setExitCode);
  expect(executor).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledTimes(4);
  expect(setExitCode).toHaveBeenCalledWith(1);
});

test('uses the default output and nonzero process-exit path without replacing diagnostics', async () => {
  const executor = mock(async () => ({
    code: 2,
    stderr: '',
    stdout: '',
  }));
  try {
    await run([], executor);
    expect(process.exitCode).toBe(2);
  } finally {
    process.exitCode = undefined;
  }
});

test('rejects arguments and protects the main boundary', async () => {
  await expect(run(['unexpected'])).rejects.toThrow(usage());
  const runner = mock(async () => undefined);
  await runWhenMain(true, [], runner);
  await runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
