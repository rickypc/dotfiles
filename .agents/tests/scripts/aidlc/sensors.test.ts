import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../../scripts/aidlc/sensors.js';
import { createAidlcIntent } from '../../../utils/aidlc/intent.js';

test('runs selected sensors through injected boundaries', async () => {
  const write = mock();
  await run(
    ['check', '/intent.md', 'workspace-scaffold'],
    write,
    mock(async () => createAidlcIntent('repo', 'X')),
    mock(() => []),
  );
  expect(write).toHaveBeenCalledWith('[]');
});

test('rejects invalid sensor commands and guards the main boundary', () => {
  expect(() => run([])).toThrow(usage());
  const runner = mock(async () => undefined);
  runWhenMain(true, [], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
