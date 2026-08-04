import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/lint.js';

test('sets a nonzero exit code after replaying every failed command diagnostic', async () => {
  const executor = mock(async ({ args }: { args: readonly string[] }) => ({
    code: args[2] === 'status' ? 0 : args.join(' ').includes('biome') ? 1 : 0,
    stderr: '',
    stdout: args[2] === 'status' ? '' : args.join(' '),
  }));
  const write = mock();
  const setExitCode = mock();
  await run([], executor, '/agents', write, setExitCode);
  expect(executor).toHaveBeenCalledTimes(3);
  expect(write).toHaveBeenCalledTimes(4);
  expect(setExitCode).toHaveBeenCalledWith(1);
});

test('uses the default output and nonzero process-exit path without replacing diagnostics', async () => {
  const executor = mock(async ({ args }: { args: readonly string[] }) => ({
    code: args[2] === 'status' ? 0 : 2,
    stderr: '',
    stdout: '',
  }));
  try {
    await run([], executor, '/agents');
    expect(process.exitCode).toBe(2);
  } finally {
    process.exitCode = undefined;
  }
});

test('throws before lint commands when a protected file has worktree changes', async () => {
  const executor = mock(async ({ args }: { args: readonly string[] }) => ({
    code: 0,
    stderr: '',
    stdout: args[2] === 'status' ? ' M .agents/biome.jsonc\n' : '',
  }));
  await expect(run([], executor, '/agents')).rejects.toThrow(
    'stop and ask the user',
  );
  expect(executor).toHaveBeenCalledTimes(1);
});

test('rejects arguments and protects the main boundary', async () => {
  await expect(run(['unexpected'])).rejects.toThrow(usage());
  const runner = mock(async () => undefined);
  await runWhenMain(true, [], runner);
  await runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
