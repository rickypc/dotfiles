import { expect, mock, test } from 'bun:test';

import { defaultContext } from '../../../utils/cli/context.js';

const realFs = { ...(await import('node:fs/promises')) };

// Delegates every directory except /memory to the real module, so same-process suites are unaffected.
mock.module('node:fs/promises', () => ({
  ...realFs,
  readdir: mock(async (directory: string, options: never) =>
    directory === '/memory'
      ? [
          { isDirectory: () => false, name: 'context.test.ts' },
          { isDirectory: () => true, name: 'nested' },
        ]
      : realFs.readdir(directory, options),
  ),
}));

test('lists directory entries with their kind', async () => {
  const items = await defaultContext().listDirectory('/memory');
  expect(items).toEqual([
    { isDirectory: false, name: 'context.test.ts' },
    { isDirectory: true, name: 'nested' },
  ]);
});

test('sets the exit code on a supplied target', () => {
  const target: { exitCode?: number | string | null } = {};
  defaultContext({ target }).setExitCode(2);
  expect(target.exitCode).toBe(2);
});

test('routes output and input through the supplied boundaries', async () => {
  const out: string[] = [];
  const err: string[] = [];
  const context = defaultContext({
    stderr: (message) => err.push(message),
    stdin: 'piped text',
    stdout: (message) => out.push(message),
  });
  context.write('a');
  context.writeError('b');
  expect(out).toEqual(['a']);
  expect(err).toEqual(['b']);
  expect(await context.readStdin()).toBe('piped text');
});
