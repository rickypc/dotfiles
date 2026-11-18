import { expect, mock, test } from 'bun:test';
import { command, createCommand, lintCommandsFor } from '../../scripts/lint.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';

const executorFor = (failing: string) =>
  mock(async ({ args }: { args: readonly string[] }) => ({
    code: args[2] === 'status' ? 0 : args.join(' ').includes(failing) ? 2 : 0,
    stderr: '',
    stdout: args[2] === 'status' ? '' : args.join(' '),
    timedOut: false,
  }));

const makeContext = () => {
  const out: string[] = [];
  const err: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [{ isDirectory: true, name: 'skills' }],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => err.push(message),
  };
  return { context, err, out };
};

test('limits Biome to JavaScript and TypeScript sources, leaving evaluation data unchanged', () => {
  const biome = lintCommandsFor('/agents').find(({ name }) => name === 'biome');
  expect(biome?.spec.args).toEqual([
    '-lc',
    "rg --files -0 -g '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}' | xargs -0 bun x biome check",
  ]);
});

test('prints every receipt in the envelope when all commands pass', async () => {
  const executor = executorFor('never');
  const { context, out } = makeContext();
  const command = createCommand({ agentsRoot: '/agents', executor });
  expect(await runCommand(command, ['--format', 'json'], context)).toBe(0);
  expect(executor).toHaveBeenCalledTimes(6);
  expect(JSON.parse(out[0] ?? '').data).toHaveLength(5);
});

test('prints a short human report with --format text, one line per passing command', async () => {
  const { context, out } = makeContext();
  const command = createCommand({ agentsRoot: '/agents', executor: executorFor('never') });
  expect(await runCommand(command, ['--format', 'text'], context)).toBe(0);
  expect(out[0]?.split('\n')).toHaveLength(5);
  expect(out[0]).not.toContain('"command"');
});

test('replays diagnostics as text and exits 1 with every receipt after a failed command', async () => {
  const executor = executorFor('biome');
  const json = makeContext();
  expect(
    await runCommand(
      createCommand({ agentsRoot: '/agents', executor }),
      ['--format', 'json'],
      json.context,
    ),
  ).toBe(1);
  const envelope = JSON.parse(json.out[0] ?? '');
  expect(envelope.diagnostics).toEqual(['Lint failed: biome.']);
  expect(envelope.data).toHaveLength(5);
  const text = makeContext();
  await runCommand(
    createCommand({ agentsRoot: '/agents', executor }),
    ['--format', 'text'],
    text.context,
  );
  expect(text.err[0]).toContain('xargs -0 bun x biome check');
  expect(text.err[0]).toContain('Lint failed: biome.');
});

test('stops before lint commands when a protected file has worktree changes', async () => {
  const executor = mock(async ({ args }: { args: readonly string[] }) => ({
    code: 0,
    stderr: '',
    stdout: args[2] === 'status' ? ' M biome.jsonc\n' : '',
    timedOut: false,
  }));
  const { context, out } = makeContext();
  const command = createCommand({ agentsRoot: '/agents', executor });
  expect(await runCommand(command, ['--format', 'json'], context)).toBe(1);
  expect(executor).toHaveBeenCalledTimes(1);
  expect(JSON.parse(out[0] ?? '').diagnostics[0]).toContain('stop and ask the user');
});

test('honors --agents-root', async () => {
  const executor = executorFor('never');
  const { context } = makeContext();
  await runCommand(
    createCommand({ agentsRoot: '/agents', executor }),
    ['--agents-root', '/other'],
    context,
  );
  expect(executor).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/other' }));
});

test('rejects arguments with usage exit 2 and answers --help', async () => {
  expect(
    await runCommand(
      createCommand({ executor: executorFor('never') }),
      ['unexpected'],
      makeContext().context,
    ),
  ).toBe(2);
  const help = makeContext();
  expect(await runCommand(command, ['--help'], help.context)).toBe(0);
  expect(help.out[0]).toContain('scripts/lint.ts');
});
