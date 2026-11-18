import { expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import { command, createCommand, runStaticChecks } from '../../scripts/biome-checker.js';
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

test('runs Biome and TypeScript and preserves failed diagnostics', async () => {
  const executor = mock(
    async ({ command }: { args: readonly string[]; command: string; cwd?: string }) =>
      command.endsWith('/biome')
        ? { code: 0, stderr: '', stdout: 'clean' }
        : { code: 1, stderr: 'type error', stdout: '' },
  );
  await expect(
    runStaticChecks(
      executor,
      {
        agentsRoot: '/agents',
        paths: ['/repo/file.ts'],
      },
      async () => 'function alpha() {}',
    ),
  ).resolves.toEqual([
    { detail: 'clean', name: 'biome', status: 'passed' },
    { detail: 'type error', name: 'bun-check', status: 'failed' },
    {
      detail: '/repo/file.ts: Top-level declarations are canonical.',
      name: 'declaration-order',
      status: 'passed',
    },
  ]);
  expect(executor).toHaveBeenCalledTimes(2);
  expect(executor.mock.calls[0]?.[0].cwd).toBe('/agents');
  expect(executor.mock.calls[1]?.[0].cwd).toBe('/agents');
  expect(executor.mock.calls[0]?.[0].args).toContain('--config-path');
  expect(executor.mock.calls[0]?.[0].args).toContain('--vcs-use-ignore-file=false');
  expect(executor.mock.calls[1]?.[0].args).toContain('check');
  expect(executor.mock.calls[1]?.[0].command).toBe('bun');
});

test('runs independent Biome, declaration-order, and TypeScript checks together', async () => {
  let releaseBiome: ((value: { code: number; stderr: string; stdout: string }) => void) | undefined;
  const biome = new Promise<{ code: number; stderr: string; stdout: string }>((resolve) => {
    releaseBiome = resolve;
  });
  let typeCheckStarted = false;
  let sourceReadStarted = false;
  const executor = mock(async ({ command }: { command: string }) => {
    if (command.endsWith('/biome')) {
      return biome;
    }
    typeCheckStarted = true;
    return { code: 0, stderr: '', stdout: 'typed' };
  });
  const result = runStaticChecks(
    executor,
    { agentsRoot: '/agents', paths: ['/repo/file.ts'] },
    async () => {
      sourceReadStarted = true;
      return 'function alpha() {}';
    },
  );
  expect(typeCheckStarted).toBeTrue();
  expect(sourceReadStarted).toBeTrue();
  releaseBiome?.({ code: 0, stderr: '', stdout: 'clean' });
  await expect(result).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'biome', status: 'passed' }),
      expect.objectContaining({ name: 'bun-check', status: 'passed' }),
      expect.objectContaining({ name: 'declaration-order', status: 'passed' }),
    ]),
  );
});

test('preserves a failed Biome result while the independent checks complete', async () => {
  const executor = mock(async ({ command }: { command: string }) =>
    command.endsWith('/biome')
      ? { code: 1, stderr: 'style error', stdout: '' }
      : { code: 0, stderr: '', stdout: 'typed' },
  );
  await expect(
    runStaticChecks(
      executor,
      { agentsRoot: '/agents', paths: ['/repo/file.ts'] },
      async () => 'function alpha() {}',
    ),
  ).resolves.toEqual(
    expect.arrayContaining([
      { detail: 'style error', name: 'biome', status: 'failed' },
      { detail: 'typed', name: 'bun-check', status: 'passed' },
      expect.objectContaining({ name: 'declaration-order', status: 'passed' }),
    ]),
  );
});
test('runs plain JavaScript through lint and structural ordering without tsc', async () => {
  const executor = mock(async () => ({ code: 0, stderr: '', stdout: 'clean' }));
  await expect(
    runStaticChecks(
      executor,
      {
        agentsRoot: '/agents',
        paths: ['/repo/file.js'],
      },
      async () => 'function alpha() {}',
    ),
  ).resolves.toEqual([
    { detail: 'clean', name: 'biome', status: 'passed' },
    {
      detail: 'No TypeScript paths selected.',
      name: 'bun-check',
      status: 'not-applicable',
    },
    {
      detail: '/repo/file.js: Top-level declarations are canonical.',
      name: 'declaration-order',
      status: 'passed',
    },
  ]);
  expect(executor).toHaveBeenCalledTimes(1);
});

test('reports structural ordering as not applicable for a non-source path', async () => {
  const executor = mock(async () => ({ code: 0, stderr: '', stdout: 'clean' }));
  await expect(
    runStaticChecks(executor, {
      agentsRoot: '/agents',
      paths: ['/repo/file.json'],
    }),
  ).resolves.toEqual([
    { detail: 'clean', name: 'biome', status: 'passed' },
    {
      detail: 'No TypeScript paths selected.',
      name: 'bun-check',
      status: 'not-applicable',
    },
    {
      detail: 'No TypeScript paths selected.',
      name: 'declaration-order',
      status: 'not-applicable',
    },
  ]);
  expect(executor).toHaveBeenCalledTimes(1);
});

test('fails the declaration-order gate without hiding the action packet', async () => {
  const executor = mock(async () => ({ code: 0, stderr: '', stdout: 'clean' }));
  const results = await runStaticChecks(
    executor,
    { agentsRoot: '/agents', paths: ['/repo/file.ts'] },
    async () => 'function zebra() {}\nfunction alpha() {}',
  );
  expect(results[2]).toEqual(
    expect.objectContaining({
      detail: expect.stringContaining('Action packet'),
      name: 'declaration-order',
      status: 'failed',
    }),
  );
});

test('blocks the declaration-order gate when a safe order cannot be proven', async () => {
  const executor = mock(async () => ({ code: 0, stderr: '', stdout: 'clean' }));
  const results = await runStaticChecks(
    executor,
    { agentsRoot: '/agents', paths: ['/repo/file.ts'] },
    async () => 'function beta() { return alpha(); }\nfunction alpha() { return beta(); }',
  );
  expect(results[2]).toEqual(
    expect.objectContaining({
      detail: expect.stringContaining('dependencies contain a cycle'),
      name: 'declaration-order',
      status: 'blocked',
    }),
  );
});

test('uses the default source reader for an existing selected TypeScript path', async () => {
  const executor = mock(async () => ({ code: 0, stderr: '', stdout: 'clean' }));
  await expect(
    runStaticChecks(executor, {
      agentsRoot: '/agents',
      paths: [new URL('../utils/contracts.test.ts', import.meta.url).pathname],
    }),
  ).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'declaration-order', status: 'passed' }),
    ]),
  );
});
