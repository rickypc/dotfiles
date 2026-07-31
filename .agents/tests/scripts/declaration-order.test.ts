import { expect, mock, test } from 'bun:test';

import { run, runWhenMain, usage } from '../../scripts/declaration-order.js';

test('renders declaration-order evidence for canonical source', async () => {
  const write = mock();
  await expect(
    run(['file.ts'], async () => 'function alpha() {}', write),
  ).resolves.toBeUndefined();
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"status": "passed"'),
  );
});

test('renders a concise global-gate summary and only failed checks', async () => {
  const passingWrite = mock();
  await run(
    ['--summary', 'alpha.ts', 'beta.ts'],
    async () => 'function alpha() {}',
    passingWrite,
  );
  expect(passingWrite).toHaveBeenCalledWith(
    'declaration-order: passed — 2 file(s) checked.',
  );
  const failedWrite = mock();
  await expect(
    run(
      ['--summary', 'alpha.ts', 'beta.ts'],
      async (path) =>
        path === 'alpha.ts'
          ? 'function alpha() {}'
          : 'function zebra() {}\nfunction beta() {}',
      failedWrite,
    ),
  ).rejects.toThrow('emitted action packet');
  expect(failedWrite).toHaveBeenCalledWith(
    expect.stringContaining('declaration-order: failed — 1 of 2 file(s)'),
  );
  expect(failedWrite).toHaveBeenCalledWith(expect.stringContaining('"errors"'));
  expect(failedWrite).toHaveBeenCalledWith(
    expect.not.stringContaining('"path": "alpha.ts"'),
  );
});

test('uses the default source reader for an existing canonical test file', async () => {
  const write = mock();
  await expect(
    run(['tests/scripts/declaration-order.test.ts'], undefined, write),
  ).resolves.toBeUndefined();
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"actionPacket": null'),
  );
});
test('rejects non-canonical declarations and protects the main boundary', async () => {
  const write = mock();
  await expect(
    run(
      ['file.ts'],
      async () => 'function zebra() {}\nfunction alpha() {}',
      write,
    ),
  ).rejects.toThrow('Declaration ordering requires the emitted action packet.');
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"actionPacket": {'),
  );
  await expect(run([], async () => '')).rejects.toThrow(
    'At least one path is required.',
  );
  await expect(run(['--unknown', 'file.ts'])).rejects.toThrow(usage());
  expect(usage()).toContain('declaration-order.ts');
  const runner = mock(async () => undefined);
  await runWhenMain(true, ['file.ts'], runner);
  await runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});

test('supports a fresh-session declaration-order repair loop without console output', async () => {
  let source = 'function zebra() {}\nfunction alpha() {}';
  const baselineWrite = mock();
  await expect(
    run(['session.ts'], async () => source, baselineWrite),
  ).rejects.toThrow('Declaration ordering requires the emitted action packet.');
  const baseline = JSON.parse(String(baselineWrite.mock.calls[0]?.[0])) as {
    readonly checks: readonly {
      readonly actionPacket: {
        readonly requiredActionGroups: readonly { readonly title: string }[];
      } | null;
      readonly status: string;
    }[];
  };
  expect(baseline.checks[0]).toEqual(
    expect.objectContaining({
      actionPacket: expect.objectContaining({
        requiredActionGroups: [
          expect.objectContaining({
            title: 'Reorder runtime declarations as alpha, zebra.',
          }),
        ],
      }),
      status: 'failed',
    }),
  );

  source = 'function alpha() {}\nfunction zebra() {}';
  const candidateWrite = mock();
  await expect(
    run(['session.ts'], async () => source, candidateWrite),
  ).resolves.toBeUndefined();
  expect(candidateWrite).toHaveBeenCalledWith(
    expect.stringContaining('"actionPacket": null'),
  );
  expect(candidateWrite).toHaveBeenCalledWith(
    expect.stringContaining('"status": "passed"'),
  );
});

test('applies a safe action packet only when explicitly requested', async () => {
  const write = mock();
  const save = mock(async () => undefined);
  await expect(
    run(
      ['--apply', 'session.ts'],
      async () => 'function zebra() {}\nfunction alpha() {}',
      write,
      save,
    ),
  ).resolves.toBeUndefined();
  expect(save).toHaveBeenCalledWith(
    'session.ts',
    'function alpha() {}\n\nfunction zebra() {}',
  );
  expect(write).toHaveBeenCalledWith(expect.stringContaining('"passed"'));
});

test('emits a blocked result without authorizing an unsafe reorder', async () => {
  const write = mock();
  await expect(
    run(
      ['cycle.ts'],
      async () =>
        'function beta() { return alpha(); }\nfunction alpha() { return beta(); }',
      write,
    ),
  ).rejects.toThrow(
    'Declaration ordering is blocked by the reported dependency.',
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"status": "blocked"'),
  );
  expect(write).toHaveBeenCalledWith(
    expect.stringContaining('"actionPacket": null'),
  );
});
