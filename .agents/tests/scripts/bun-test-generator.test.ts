import { expect, mock, test } from 'bun:test';

import { command, validateExternalDependencyMocks } from '../../scripts/bun-test-generator.js';
import type { CliContext } from '../../utils/cli/context.js';
import { runCommand } from '../../utils/cli/index.js';

const run = async (
  args: readonly string[],
  write: (message: string) => void = () => undefined,
): Promise<void> => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  const code = await runCommand(command, [...args, '--format', 'text'], context);
  if (code !== 0) {
    throw new Error(out.join('\n'));
  }
  write(out[0] ?? '');
};

test('renders canonical test paths and validates Bun test sources', async () => {
  const write = mock();
  await run(['test-path', '/repo', '/repo/source.ts'], write);
  await run(['canonical-path', '/repo/source.ts', '/repo/package.json'], write);
  await run(['validate-source', 'import { test } from "bun:test"; test("x", () => {});'], write);
  await run(
    [
      'validate-boundaries',
      JSON.stringify({
        sutModuleSpecifier: './sut.js',
        sutSource:
          "import { readFile } from 'node:fs/promises'; export const load = () => readFile('input');",
        testSource:
          "import { mock, test } from 'bun:test'; mock.module('node:fs/promises', () => ({ readFile: mock() })); test('load', () => {});",
      }),
    ],
    write,
  );
  await run(
    [
      'template',
      JSON.stringify({
        actualExpression: 'sut.parse(input)',
        cases: [{ expected: 'ok', input: '', label: 'empty' }],
        externalMocks: [],
        importPath: './sut.js',
        matcher: 'toEqual',
      }),
    ],
    write,
  );
  await run(
    ['convert-jest', "import { jest, test } from '@jest/globals'; test('x', () => jest.fn());"],
    write,
  );
  expect(write.mock.calls).toEqual([
    ['/repo/tests/source.test.ts'],
    ['/repo/tests/source.test.ts'],
    ['bun-test-source: passed'],
    ['bun-test-boundaries: passed'],
    [expect.stringContaining('test.each')],
    [expect.stringContaining("from 'bun:test'")],
  ]);
});

test.each([
  { label: 'newline', source: '// fetch() is commented out\nexport const value = 1;' },
  { label: 'end of input', source: '// fetch() is commented out' },
])('ignores fetch in a line comment at $label', ({ source }) => {
  expect(() =>
    validateExternalDependencyMocks(
      source,
      "import { test } from 'bun:test'; test('boundary scan', () => {});",
    ),
  ).not.toThrow();
});

test('rejects invalid input with a failure exit and the validator message', async () => {
  await expect(run(['validate-source', 'jest.fn()'])).rejects.toThrow('bun:test');
  await expect(run(['validate-boundaries', '{}'])).rejects.toThrow(
    'sutSource, testSource, and sutModuleSpecifier',
  );
  const base = {
    sutModuleSpecifier: './sut.js',
    sutSource: 'export const load = () => true;',
    testSource: "import { test } from 'bun:test';",
  };
  await expect(
    run(['validate-boundaries', JSON.stringify({ ...base, scope: 'unsupported' })]),
  ).rejects.toThrow('scope must be');
  await expect(
    run(['validate-boundaries', JSON.stringify({ ...base, preloadSource: 42 })]),
  ).rejects.toThrow('preloadSource must be a string');
});

test('rejects an unknown subcommand and a wrong argument count with usage exit 2', async () => {
  const out: string[] = [];
  const context: CliContext = {
    listDirectory: async () => [],
    readStdin: async () => '',
    setExitCode: () => undefined,
    write: (message) => out.push(message),
    writeError: (message) => out.push(message),
  };
  expect(await runCommand(command, [], context)).toBe(2);
  expect(await runCommand(command, ['test-path', '/repo'], context)).toBe(2);
  expect(await runCommand(command, ['--help'], context)).toBe(0);
  expect(out.at(-1)).toContain('validate-boundaries');
});
