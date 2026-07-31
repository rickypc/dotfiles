import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../../scripts/aidlc/stage.js';
import { createAidlcIntent } from '../../../utils/aidlc/intent.js';

test('renders a deterministic stage packet through injected boundaries', async () => {
  const write = mock();
  await run(
    ['next', '/agents', '/intent.md'],
    write,
    mock(async () => createAidlcIntent('repo', 'X')),
    undefined,
    mock(async () => undefined),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('workspace-scaffold'),
  );
});

test('rejects invalid stage commands and guards the main boundary', () => {
  expect(() => run([])).toThrow(usage());
  const runner = mock(async () => undefined);
  runWhenMain(true, [], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
