import { expect, mock, test } from 'bun:test';

import {
  bindingFor,
  run,
  runWhenMain,
  usage,
} from '../../../scripts/aidlc/context.js';
import { createAidlcIntent } from '../../../utils/aidlc/intent.js';

const reverseEngineeringIntent = () => ({
  ...createAidlcIntent('repo', 'X'),
  stage: 'reverse-engineering' as const,
});

test('resolves and persists context through injected boundaries', async () => {
  const intent = reverseEngineeringIntent();
  const update = mock(async () => undefined);
  const write = mock();
  await run(
    [
      'resolve',
      '/intent.md',
      '/kb',
      'shared/organization/rules.md',
      '-',
      'repo/project/rules.md',
    ],
    () => 'now',
    write,
    mock(async () => intent),
    update,
    mock(async () => ({
      bindings: {},
      resolvedAt: 'now',
      rules: [],
      sources: [],
    })),
    mock(async () => undefined),
  );
  expect(update).toHaveBeenCalled();
  expect(write).toHaveBeenCalledWith(expect.stringContaining('resolvedAt'));
  await run(
    ['resolve', '/intent.md', '/kb', '-', '-', '-'],
    undefined,
    mock(),
    mock(async () => intent),
    mock(async () => undefined),
    mock(async () => ({
      bindings: {},
      resolvedAt: 'now',
      rules: [],
      sources: [],
    })),
    mock(async () => undefined),
  );
});

test('rejects invalid context command and guards the main boundary', () => {
  expect(bindingFor('-')).toBeUndefined();
  expect(bindingFor('shared/organization/rules.md')).toBe(
    'shared/organization/rules.md',
  );
  expect(() => run([])).toThrow(usage());
  const runner = mock(async () => undefined);
  runWhenMain(true, [], runner);
  runWhenMain(false, [], runner);
  expect(runner).toHaveBeenCalledTimes(1);
});

test('rejects context resolution before reverse engineering', async () => {
  await expect(
    run(
      ['resolve', '/intent.md', '/kb', '-', '-', '-'],
      undefined,
      mock(),
      mock(async () => createAidlcIntent('repo', 'X')),
      mock(async () => undefined),
      mock(async () => ({
        bindings: {},
        resolvedAt: 'now',
        rules: [],
        sources: [],
      })),
      mock(async () => undefined),
    ),
  ).rejects.toThrow('reverse-engineering');
});
