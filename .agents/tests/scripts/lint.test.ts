import { expect, mock, test } from 'bun:test';

import { processExit, run, runWhenMain, usage } from '../../scripts/lint.js';

test('sets a nonzero exit code after replaying every failed command diagnostic', async () => {
  const executor = mock(async ({ args }: { args: readonly string[] }) => ({
    code: args[2] === 'status' ? 0 : args.join(' ').includes('biome') ? 1 : 0,
    stderr: '',
    stdout: args[2] === 'status' ? '' : args.join(' '),
  }));
  const write = mock();
  const setExitCode = mock();
  await run([], executor, '/agents', write, setExitCode);
  expect(executor).toHaveBeenCalledTimes(4);
  expect(write).toHaveBeenCalledTimes(6);
  expect(setExitCode).toHaveBeenCalledWith(1);
});

test('writes exit status through a supplied process target', () => {
  const target: { exitCode?: number } = {};
  processExit.setExitCode(2, target);
  expect(target.exitCode).toBe(2);
});

test('uses the mocked process-exit boundary without replacing diagnostics', async () => {
  const executor = mock(async ({ args }: { args: readonly string[] }) => ({
    code: args[2] === 'status' ? 0 : 2,
    stderr: '',
    stdout: '',
  }));
  const setExitCode = mock();
  const originalSetExitCode = processExit.setExitCode;
  processExit.setExitCode = setExitCode;
  try {
    await run([], executor, '/agents');
    expect(setExitCode).toHaveBeenCalledWith(2);
  } finally {
    processExit.setExitCode = originalSetExitCode;
  }
});

test('throws before lint commands when a protected file has worktree changes', async () => {
  const executor = mock(async ({ args }: { args: readonly string[] }) => ({
    code: 0,
    stderr: '',
    stdout: args[2] === 'status' ? ' M biome.jsonc\n' : '',
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
