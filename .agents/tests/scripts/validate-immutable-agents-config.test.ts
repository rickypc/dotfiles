import { expect, mock, test } from 'bun:test';

const checkImmutableAgentsConfig = mock(
  async (
    executor: (spec: unknown) => Promise<{
      readonly code: number;
      readonly stderr: string;
      readonly stdout: string;
    }>,
  ) => {
    const result = await executor({});
    return result.stdout
      ? {
          detail:
            'Protected .agents configuration has worktree changes. Stop and ask the user.',
          paths: ['.agents/biome.jsonc'],
          status: 'failed' as const,
        }
      : {
          detail:
            'immutable-agents-config: passed — protected files match the Git index.',
          paths: [],
          status: 'passed' as const,
        };
  },
);

mock.module('../utils/immutable-agents-config.js', () => ({
  checkImmutableAgentsConfig,
}));
mock.module('../utils/process.js', () => ({ bunExecutor: mock() }));
mock.module('../utils/cli.js', () => ({
  runWhenMain: (
    isMain: boolean,
    args: readonly string[],
    runner: (runnerArgs: readonly string[]) => void,
  ) => {
    if (isMain) {
      runner(args);
    }
  },
}));

const { run, runWhenMain, usage } = await import(
  '../../scripts/validate-immutable-agents-config.js'
);

test('reports a passing protection check', async () => {
  const executor = mock(async () => ({ code: 0, stderr: '', stdout: '' }));
  const write = mock();
  const receipt = await run([], executor, '/agents', write);
  expect(receipt.status).toBe('passed');
  expect(write.mock.calls).toEqual([
    ['immutable-agents-config: passed — protected files match the Git index.'],
    ['\n'],
  ]);
});

test('throws before the final gate can continue on a worktree mutation', async () => {
  const write = mock();
  const executor = mock(async () => ({
    code: 0,
    stderr: '',
    stdout: ' M .agents/biome.jsonc\n',
  }));
  await expect(run([], executor, '/agents', write)).rejects.toThrow(
    'stop and ask the user',
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('Protected'));
});

test('rejects arguments and protects the main boundary', async () => {
  await expect(run(['unexpected'])).rejects.toThrow(usage());
  const runner = mock(async () => undefined);
  await runWhenMain(true, [], runner);
  await runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});
