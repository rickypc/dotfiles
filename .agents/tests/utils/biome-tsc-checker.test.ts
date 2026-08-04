import { expect, mock, test } from 'bun:test';

import { runStaticChecks } from '../../utils/biome-tsc-checker.js';

test('runs Biome and TypeScript and preserves failed diagnostics', async () => {
  const executor = mock(
    async ({ command }: { args: readonly string[]; command: string }) =>
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
    { detail: 'type error', name: 'tsc', status: 'failed' },
    {
      detail: '/repo/file.ts: Top-level declarations are canonical.',
      name: 'declaration-order',
      status: 'passed',
    },
  ]);
  expect(executor).toHaveBeenCalledTimes(2);
  expect(executor.mock.calls[0]?.[0].args).toContain('--config-path');
  expect(executor.mock.calls[1]?.[0].args).toContain('--ignoreConfig');
  expect(executor.mock.calls[1]?.[0].args).toContain(
    '/agents/node_modules/@types',
  );
});

test('starts independent Biome, TypeScript, and declaration-order work together', async () => {
  let releaseBiome:
    | ((value: { code: number; stderr: string; stdout: string }) => void)
    | undefined;
  const biome = new Promise<{ code: number; stderr: string; stdout: string }>(
    (resolve) => {
      releaseBiome = resolve;
    },
  );
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
      expect.objectContaining({ name: 'tsc', status: 'passed' }),
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
      { detail: 'typed', name: 'tsc', status: 'passed' },
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
      name: 'tsc',
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
      name: 'tsc',
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
    async () =>
      'function beta() { return alpha(); }\nfunction alpha() { return beta(); }',
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
      paths: ['tests/utils/contracts.test.ts'],
    }),
  ).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'declaration-order', status: 'passed' }),
    ]),
  );
});
