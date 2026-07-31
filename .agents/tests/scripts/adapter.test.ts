import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/adapter.js';

test('renders a manual adapter handoff', () => {
  const write = mock();
  run(['codex', '/agents'], write);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('Codex'));
});

test('renders the Kiro IDE manual adapter handoff', () => {
  const write = mock();
  run(['kiro-ide', '/agents'], write);
  expect(write).toHaveBeenCalledWith(expect.stringContaining('Kiro IDE'));
});

test('rejects invalid adapter input and protects the main boundary', () => {
  expect(() => run([])).toThrow(usage());
  const runner = mock();
  runWhenMain(true, ['codex', '/agents'], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
