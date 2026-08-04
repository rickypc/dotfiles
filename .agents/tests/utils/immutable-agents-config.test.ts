import { expect, mock, test } from 'bun:test';

mock.module('./contracts.js', () => ({}));
mock.module('./process.js', () => ({}));

const processBoundary = mock(() => process);
const { checkImmutableAgentsConfig, protectedAgentsConfigPaths } = await import(
  '../../utils/immutable-agents-config.js'
);

const resultFor = (stdout: string, code = 0) => ({
  code,
  stderr: '',
  stdout,
});

test('passes when protected files are clean or staged only', async () => {
  const executor = mock(async (_spec: { readonly args: readonly string[] }) =>
    resultFor('M  .agents/biome.jsonc\n'),
  );
  const receipt = await checkImmutableAgentsConfig(executor, '/agents');
  expect(receipt).toEqual({
    detail:
      'immutable-agents-config: passed — protected files match the Git index.',
    paths: [],
    status: 'passed',
  });
  expect(executor).toHaveBeenCalledTimes(1);
  expect(executor.mock.calls[0]?.[0].args).toContain('.agents/biome.jsonc');
  expect(processBoundary).not.toHaveBeenCalled();
});

test.each([
  [' M .agents/biome.jsonc\n', ['.agents/biome.jsonc']],
  ['MM .agents/package.json\n', ['.agents/package.json']],
  ['?? .agents/tsconfig.json\n', ['.agents/tsconfig.json']],
])('fails for protected worktree mutation %s', async (stdout, paths) => {
  const executor = mock(async () => resultFor(stdout));
  const receipt = await checkImmutableAgentsConfig(executor, '/agents');
  expect(receipt.status).toBe('failed');
  expect(receipt.paths).toEqual(paths);
  expect(receipt.detail).toContain('stop and ask the user');
});

test('fails closed when git status cannot run', async () => {
  const executor = mock(async () =>
    resultFor('fatal: not a git repository', 128),
  );
  const receipt = await checkImmutableAgentsConfig(executor, '/agents');
  expect(receipt.status).toBe('failed');
  expect(receipt.detail).toContain('code 128');
});

test('keeps the protected path list explicit and complete', () => {
  expect(protectedAgentsConfigPaths).toEqual([
    '.gitignore',
    'biome.jsonc',
    'bunfig.toml',
    'LICENSE',
    'NOTICE',
    'package.json',
    'tsconfig.json',
  ]);
});
