import { expect, mock, test } from 'bun:test';
import {
  command,
  createCommand,
  lintCommandsFor,
  lintDiagnostics,
  lintExitCode,
  runLintCommands,
} from '../../scripts/lint.js';
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

test('defines the distinct lint commands under one agents root', () => {
  const commands = lintCommandsFor('/agents');
  expect(commands.map(({ name }) => name)).toEqual([
    'atom-maps',
    'biome',
    'declaration-order',
    'instruction-gate',
    'skills',
  ]);
  expect(commands.every(({ spec }) => spec.cwd === '/agents')).toBe(true);
  expect(commands[0]?.spec.args.join(' ')).toContain('skill-manager/index.ts audit "$PWD" --check');
  expect(commands[2]?.spec.args.join(' ')).toContain('*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}');
  expect(commands[3]?.spec.args.join(' ')).toContain('scripts/instruction-gate/index.ts verify');
  expect(commands[4]?.spec.args.join(' ')).toContain('scripts/validate/skills.ts --format text');
  expect(commands[2]?.spec.args.join(' ')).toContain('--summary --format text');
});

test('runs distinct lint commands together and preserves every command result', async () => {
  let releaseBiome: ((value: { code: number; stderr: string; stdout: string }) => void) | undefined;
  const biome = new Promise<{ code: number; stderr: string; stdout: string }>((resolve) => {
    releaseBiome = resolve;
  });
  let started = 0;
  const executor = mock(async ({ args }: { args: readonly string[] }) => {
    started += 1;
    return args.join(' ').includes('biome') ? biome : { code: 0, stderr: '', stdout: `${started}` };
  });
  const receipts = runLintCommands(executor, '/agents');
  expect(started).toBe(5);
  releaseBiome?.({ code: 0, stderr: '', stdout: 'biome' });
  await expect(receipts).resolves.toHaveLength(5);
});

test('replays command output without converting failures into replacement errors', () => {
  const receipts = [
    {
      name: 'biome' as const,
      result: { code: 0, stderr: 'biome stderr', stdout: 'biome stdout' },
    },
    {
      name: 'declaration-order' as const,
      result: {
        code: 4,
        stderr: 'declaration-order stderr',
        stdout: 'declaration-order stdout',
      },
    },
  ];
  expect(lintDiagnostics(receipts)).toBe(
    'biome stdout\ndeclaration-order: failed\ndeclaration-order stdout\ndeclaration-order stderr',
  );
  const quiet = [
    { name: 'biome' as const, result: { code: 0, stderr: 'noise\nChecked 9 files', stdout: '' } },
  ];
  expect(lintDiagnostics(quiet)).toBe('biome: passed - Checked 9 files');
  expect(lintExitCode(receipts)).toBe(4);
});
