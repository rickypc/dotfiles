import { expect, test } from 'bun:test';

import { command, parseCheck } from '../../../scripts/validate/index.js';
import type { CliContext } from '../../../utils/cli/context.js';
import { runCommand } from '../../../utils/cli/index.js';
import { UsageError } from '../../../utils/cli/usage-error.js';

const makeContext = () => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  return { context, out };
};

test('parses a check, keeping colons inside the detail', () => {
  expect(parseCheck('biome:passed:clean')).toEqual({
    detail: 'clean',
    name: 'biome',
    status: 'passed',
  });
  expect(parseCheck('x:failed:a:b').detail).toBe('a:b');
});

test('rejects a malformed check as a usage error', () => {
  expect(() => parseCheck('bad')).toThrow(UsageError);
  expect(() => parseCheck('x:unknown:detail')).toThrow('Invalid check');
});

test('prints passing evidence as an envelope and as the rendered summary', async () => {
  const json = makeContext();
  expect(
    await runCommand(
      command,
      ['biome:passed:clean', 'tsc:not-applicable:JavaScript'],
      json.context,
    ),
  ).toBe(0);
  expect(JSON.parse(json.out[0] ?? '').data).toHaveLength(2);
  const text = makeContext();
  await runCommand(command, ['biome:passed:clean', '--format', 'text'], text.context);
  expect(text.out[0]).toContain('biome: passed');
});

test('fails with exit 1 on failed evidence, 2 on malformed or missing evidence', async () => {
  expect(await runCommand(command, ['biome:failed:bad'], makeContext().context)).toBe(1);
  expect(await runCommand(command, ['bad'], makeContext().context)).toBe(2);
  expect(await runCommand(command, [], makeContext().context)).toBe(2);
});
