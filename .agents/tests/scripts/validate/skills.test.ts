import { expect, mock, test } from 'bun:test';

import { createCommand, validReceiptLine } from '../../../scripts/validate/skills.js';
import type { CliContext } from '../../../utils/cli/context.js';
import { runCommand } from '../../../utils/cli/index.js';

const receipt = {
  matrixCount: 15,
  prose: {
    checkedLocalLinkTargets: 7,
    findings: [],
    ignoredPaths: [],
    prosePaths: Array.from({ length: 34 }, (_, index) => `path-${index}`),
    reviewedRoots: ['/tmp/.agents/skills'],
  },
  skillCount: 13,
  status: 'valid' as const,
};

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

test('renders one concise stable success receipt line', () => {
  expect(validReceiptLine(receipt)).toBe(
    'skill-validation: passed - 13 skills, 15 matrix cases, 34 prose paths, 7 local links checked.',
  );
});

test('validates the skills directory of the default root and prints the envelope', async () => {
  const validate = mock(async () => receipt);
  const { context, out } = makeContext();
  const command = createCommand({ agentsRoot: '/tmp/.agents', validate });
  expect(await runCommand(command, ['--format', 'json'], context)).toBe(0);
  expect(validate).toHaveBeenCalledWith(expect.anything(), '/tmp/.agents/skills');
  expect(JSON.parse(out[0] ?? '').data.skillCount).toBe(13);
});

test('prints the stable receipt line with --format text', async () => {
  const { context, out } = makeContext();
  const command = createCommand({ agentsRoot: '/tmp/.agents', validate: async () => receipt });
  await runCommand(command, ['--format', 'text'], context);
  expect(out).toEqual([validReceiptLine(receipt)]);
});

test('honors --agents-root over the default root', async () => {
  const validate = mock(async () => receipt);
  const { context } = makeContext();
  const command = createCommand({ agentsRoot: '/tmp/default', validate });
  await runCommand(command, ['--agents-root', '/tmp/other'], context);
  expect(validate).toHaveBeenCalledWith(expect.anything(), '/tmp/other/skills');
});

test('maps arguments to usage exit 2 and validator failures to exit 1', async () => {
  const command = createCommand({
    agentsRoot: '/tmp/.agents',
    validate: async () => {
      throw new Error('skill invalid');
    },
  });
  expect(await runCommand(command, ['unexpected'], makeContext().context)).toBe(2);
  expect(await runCommand(command, [], makeContext().context)).toBe(1);
});

test('uses the location-derived agents root and real validator by default', async () => {
  const { context } = makeContext();
  expect(await runCommand(createCommand(), ['--help'], context)).toBe(0);
});
