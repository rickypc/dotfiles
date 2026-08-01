import { expect, mock, test } from 'bun:test';

import type { spawnSync } from 'node:child_process';

import { run, usage } from '../../../scripts/aidlc/gate.js';

test('runs exactly one default final-gate command and records its receipt', () => {
  const write = mock();
  const execute = mock(() => ({ status: 0 }));
  run(
    ['run', '/a-project-without-a-config'],
    write,
    execute as unknown as typeof spawnSync,
  );
  expect(execute).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledWith(
    '/bin/sh',
    ['-lc', 'bun run test'],
    expect.objectContaining({ cwd: '/a-project-without-a-config' }),
  );
  expect(write).toHaveBeenCalledWith(
    'final gate: bun run test passed (exit 0)',
  );
});

test('rejects an invalid gate command shape', () => {
  expect(() => run(['run', 'relative'])).toThrow('absolute project root');
  expect(() => run(['wrong', '/project'])).toThrow(usage());
});

test('resolves the default gate without launching a command', () => {
  const write = mock();
  const execute = mock(() => ({ status: 0 }));
  run(
    ['resolve', '/a-project-without-a-config'],
    write,
    execute as unknown as typeof spawnSync,
  );
  expect(write).toHaveBeenCalledWith('bun run test');
  expect(execute).not.toHaveBeenCalled();
});

test('records a failed final gate without leaving test-process failure state', () => {
  const write = mock();
  try {
    run(
      ['run', '/a-project-without-a-config'],
      write,
      mock(() => ({ status: 3 })) as unknown as typeof spawnSync,
    );
    expect(write).toHaveBeenCalledWith(
      'final gate: bun run test failed (exit 3)',
    );
    expect(process.exitCode).toBe(3);
  } finally {
    process.exitCode = 0;
  }
});
