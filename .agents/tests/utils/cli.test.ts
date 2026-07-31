import { expect, mock, test } from 'bun:test';

import { runWhenMain } from '../../utils/cli.js';

test('runs only the requested CLI main boundary', () => {
  const runner = mock(() => 'ran');
  expect(runWhenMain(false, ['x'], runner)).toBeUndefined();
  expect(runWhenMain(true, ['x'], runner)).toBe('ran');
  expect(runner).toHaveBeenCalledTimes(1);
});

test('returns an asynchronous runner result', async () => {
  await expect(runWhenMain(true, ['x'], async () => 'ran')).resolves.toBe(
    'ran',
  );
});
