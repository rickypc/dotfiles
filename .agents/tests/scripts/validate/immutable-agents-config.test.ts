import { expect, mock, test } from 'bun:test';

import { command, createCommand } from '../../../scripts/validate/immutable-agents-config.js';
import type { CliContext } from '../../../utils/cli/context.js';
import { runCommand } from '../../../utils/cli/index.js';

const executorWith = (stdout: string) =>
  mock(async () => ({ code: 0, stderr: '', stdout, timedOut: false }));

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

test('reports a passing protection check as an envelope and as text', async () => {
  const passing = createCommand({ agentsRoot: '/agents', executor: executorWith('') });
  const json = makeContext();
  expect(await runCommand(passing, [], json.context)).toBe(0);
  expect(JSON.parse(json.out[0] ?? '').data.status).toBe('passed');
  const text = makeContext();
  await runCommand(passing, ['--format', 'text'], text.context);
  expect(text.out).toEqual([
    'immutable-agents-config: passed - protected files match the Git index.',
  ]);
});

test('fails with exit 1 and the stop-and-ask detail on a worktree mutation', async () => {
  const failing = createCommand({
    agentsRoot: '/agents',
    executor: executorWith(' M .agents/biome.jsonc\n'),
  });
  const { context, out } = makeContext();
  expect(await runCommand(failing, [], context)).toBe(1);
  expect(JSON.parse(out[0] ?? '').diagnostics[0]).toContain('stop and ask the user');
});

test('rejects arguments with usage exit 2 and answers --help', async () => {
  const passing = createCommand({ agentsRoot: '/agents', executor: executorWith('') });
  expect(await runCommand(passing, ['unexpected'], makeContext().context)).toBe(2);
  expect(await runCommand(command, ['--help'], makeContext().context)).toBe(0);
});

test('passes --agents-root to the check', async () => {
  const executor = executorWith('');
  const { context } = makeContext();
  await runCommand(
    createCommand({ agentsRoot: '/agents', executor }),
    ['--agents-root', '/other'],
    context,
  );
  expect(executor).toHaveBeenCalled();
});

test('defaults to the location-derived root and the Bun executor', () => {
  expect(createCommand().script).toBe('scripts/validate/immutable-agents-config.ts');
});
