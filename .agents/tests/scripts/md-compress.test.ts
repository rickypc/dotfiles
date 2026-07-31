import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/md-compress.js';

test('renders compression guidance through a mocked output boundary', () => {
  const write = mock();
  run(['/docs/plan.md'], write);
  expect(write).toHaveBeenCalledWith(usage());
});

test('rejects an invalid command shape', () => {
  expect(() => run([])).toThrow('Usage:');
});

test.each([
  [false, 0],
  [true, 1],
])('runs CLI work only when the script is main', (isMain, calls) => {
  const runner = mock();
  runWhenMain(isMain, ['file.md'], runner);
  expect(runner).toHaveBeenCalledTimes(calls);
});
