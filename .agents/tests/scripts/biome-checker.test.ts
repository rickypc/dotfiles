import { expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import { command, createCommand } from '../../scripts/biome-checker.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';

const executorWith = (code: number, stdout: string) =>
  mock(async () => ({ code, stderr: '', stdout, timedOut: false }));

const makeContext = () => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [{ isDirectory: true, name: 'skills' }],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  return { context, out };
};

const passingSource = async () => 'function alpha() {}';

test('runs the static checks through injected boundaries and prints the envelope', async () => {
  const executor = executorWith(0, 'clean');
  const { context, out } = makeContext();
  const checker = createCommand({ agentsRoot: '/agents', executor, read: passingSource });
  expect(await runCommand(checker, ['/repo/file.ts'], context)).toBe(0);
  expect(executor).toHaveBeenCalledTimes(2);
  const envelope = JSON.parse(out[0] ?? '');
  expect(envelope.data.map((check: { name: string }) => check.name)).toEqual([
    'biome',
    'bun-check',
    'declaration-order',
  ]);
});

test('prints the stable summary text with --format text', async () => {
  const { context, out } = makeContext();
  const checker = createCommand({
    agentsRoot: '/agents',
    executor: executorWith(0, 'clean'),
    read: passingSource,
  });
  await runCommand(checker, ['/repo/file.ts', '--format', 'text'], context);
  expect(out).toEqual([
    'biome: passed - clean\nbun-check: passed - clean\ndeclaration-order: passed - /repo/file.ts: Top-level declarations are canonical.',
  ]);
});

test('fails with exit 1 and keeps every check in the failure data', async () => {
  const { context, out } = makeContext();
  const checker = createCommand({
    agentsRoot: '/agents',
    executor: executorWith(1, 'lint finding'),
    read: passingSource,
  });
  expect(await runCommand(checker, ['/repo/file.ts'], context)).toBe(1);
  const envelope = JSON.parse(out[0] ?? '');
  expect(envelope.ok).toBe(false);
  expect(envelope.data[0]).toMatchObject({ name: 'biome', status: 'failed' });
});

test('honors --agents-root for the tool locations', async () => {
  const executor = executorWith(0, 'clean');
  const { context } = makeContext();
  const checker = createCommand({ agentsRoot: '/agents', executor, read: passingSource });
  await runCommand(checker, ['/repo/file.ts', '--agents-root', '/other'], context);
  expect(executor).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/other' }));
});

test('requires at least one path and answers --help', async () => {
  const checker = createCommand({
    agentsRoot: '/agents',
    executor: executorWith(0, ''),
    read: passingSource,
  });
  expect(await runCommand(checker, [], makeContext().context)).toBe(2);
  const help = makeContext();
  expect(await runCommand(command, ['--help'], help.context)).toBe(0);
  expect(help.out[0]).toContain('<path>...');
});

test('uses the default source reader when an existing selected path is provided', async () => {
  const { context, out } = makeContext();
  const checker = createCommand({ agentsRoot: '/agents', executor: executorWith(0, 'clean') });
  expect(await runCommand(checker, [join(import.meta.dir, 'biome-checker.test.ts')], context)).toBe(
    0,
  );
  expect(out).toHaveLength(1);
});

test('builds the default command from the Bun executor and the real reader', () => {
  expect(createCommand().script).toBe('scripts/biome-checker.ts');
});
