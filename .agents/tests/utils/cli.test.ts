import { expect, mock, test } from 'bun:test';

import { runWhenMain, runWhenMainWithHelp } from '../../utils/cli.js';

test('runs only the requested CLI main boundary', () => {
  const runner = mock(() => 'ran');
  expect(runWhenMain(false, ['x'], runner)).toBeUndefined();
  expect(runWhenMain(true, ['x'], runner)).toBe('ran');
  expect(runner).toHaveBeenCalledTimes(1);
});

test('returns an asynchronous runner result', async () => {
  await expect(runWhenMain(true, ['x'], async () => 'ran')).resolves.toBe('ran');
});

test('handles help before invoking the script runner', () => {
  const runner = mock(() => 'ran');
  const write = mock();
  const usage = () => 'Usage: example <path>';

  expect(runWhenMainWithHelp(false, ['--help'], usage, runner, write)).toBeUndefined();
  expect(runWhenMainWithHelp(true, ['--help'], usage, runner, write)).toBe(undefined);
  expect(runWhenMainWithHelp(true, ['-h'], usage, runner, write)).toBe(undefined);
  expect(runner).not.toHaveBeenCalled();
  expect(write).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledWith('Usage: example <path>');

  expect(runWhenMainWithHelp(true, ['path'], usage, runner, write)).toBe('ran');
  expect(runner).toHaveBeenCalledWith(['path']);
});
